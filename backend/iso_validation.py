from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
from math import isfinite
import re
import time
from typing import Iterable

import numpy as np
from scipy.integrate import quad
from scipy.optimize import brentq
from scipy.stats import beta, chi2, nct, norm


VALID_SCENARIOS = {"two-sided", "lower", "upper"}


@dataclass(frozen=True)
class ValidationResult:
    title_label: str
    scenario: str
    n: int
    mean: float
    std: float
    p_target: float
    conf_target: float
    k_factor: float
    ltl: float
    utl: float
    lsl: float | None
    usl: float | None
    passed: bool | None
    verdict: str
    reasons: list[str]
    claim: dict[str, float | str | None]
    plot: dict[str, object]

    def to_dict(self) -> dict[str, object]:
        return {
            "title_label": self.title_label,
            "scenario": self.scenario,
            "n": self.n,
            "mean": self.mean,
            "std": self.std,
            "p_target": self.p_target,
            "conf_target": self.conf_target,
            "k_factor": self.k_factor,
            "ltl": finite_or_none(self.ltl),
            "utl": finite_or_none(self.utl),
            "lsl": self.lsl,
            "usl": self.usl,
            "passed": self.passed,
            "verdict": self.verdict,
            "reasons": self.reasons,
            "claim": self.claim,
            "plot": self.plot,
        }


def parse_samples(raw: str | Iterable[float]) -> list[float]:
    if isinstance(raw, str):
        values = [item for item in re.split(r"[\s,，;；]+", raw.strip()) if item]
        if not values:
            raise ValueError("请输入样本数据。")
        try:
            return [float(item) for item in values]
        except ValueError as exc:
            raise ValueError("样本数据中存在无法识别的数字。") from exc

    try:
        return [float(item) for item in raw]
    except (TypeError, ValueError) as exc:
        raise ValueError("样本数据格式不正确。") from exc


def parse_groups(raw_groups: Iterable[dict[str, object]]) -> list[dict[str, object]]:
    groups: list[dict[str, object]] = []
    for index, group in enumerate(raw_groups, start=1):
        samples = parse_samples(str(group.get("samples", "")))
        if len(samples) < 2:
            raise ValueError(f"第 {index} 组样本量至少需要 2。")
        label = str(group.get("label") or f"组 {index}")
        groups.append({"label": label, "samples": samples})
    if len(groups) < 2:
        raise ValueError("多组共同方差模式至少需要 2 组样本。")
    return groups


def run_iso_validation(
    data: Iterable[float],
    p_target: float = 0.95,
    conf_target: float = 0.95,
    scenario: str = "two-sided",
    two_sided_method: str = "fast",
    lsl: float | None = None,
    usl: float | None = None,
    title_label: str = "产品特性",
) -> ValidationResult:
    samples = np.array(list(data), dtype=float)
    if len(samples) < 3:
        raise ValueError("依据 ISO 16269-6，样本量 n 至少需要 3。")
    if not np.all(np.isfinite(samples)):
        raise ValueError("样本数据不能包含空值、无穷大或非数字。")
    if scenario not in VALID_SCENARIOS:
        raise ValueError("scenario 必须为 two-sided、lower 或 upper。")
    if not 0 < p_target < 1:
        raise ValueError("目标覆盖率 p 必须在 0 和 1 之间。")
    if not 0 < conf_target < 1:
        raise ValueError("置信度 confidence 必须在 0 和 1 之间。")
    if lsl is not None and usl is not None and lsl >= usl:
        raise ValueError("LSL 必须小于 USL。")

    n = len(samples)
    df = n - 1
    mean = float(np.mean(samples))
    std = float(np.std(samples, ddof=1))
    if std <= 0:
        raise ValueError("样本标准差必须大于 0，请确认样本不是全部相同。")

    alpha = 1 - conf_target
    if scenario in {"lower", "upper"}:
        z_p = norm.ppf(p_target)
        nc = z_p * np.sqrt(n)
        k_factor = float(nct.ppf(conf_target, df, nc) / np.sqrt(n))
        ltl = mean - k_factor * std if scenario == "lower" else float("-inf")
        utl = mean + k_factor * std if scenario == "upper" else float("inf")
    else:
        k_factor = two_sided_k_factor(n, p_target, conf_target, two_sided_method)
        ltl = mean - k_factor * std
        utl = mean + k_factor * std

    passed, reasons = evaluate_specs(scenario, ltl, utl, lsl, usl)
    verdict = build_verdict(passed, reasons)

    return ValidationResult(
        title_label=title_label or "产品特性",
        scenario=scenario,
        n=n,
        mean=mean,
        std=std,
        p_target=p_target,
        conf_target=conf_target,
        k_factor=k_factor,
        ltl=ltl,
        utl=utl,
        lsl=lsl,
        usl=usl,
        passed=passed,
        verdict=verdict,
        reasons=reasons,
        claim=build_claim(scenario, ltl, utl),
        plot=build_plot(samples, mean, std, scenario, ltl, utl, lsl, usl),
    )


def run_pooled_validation(
    groups: Iterable[dict[str, object]],
    p_target: float = 0.95,
    conf_target: float = 0.95,
    scenario: str = "two-sided",
    two_sided_method: str = "fast",
    lsl: float | None = None,
    usl: float | None = None,
    title_label: str = "产品特性",
) -> dict[str, object]:
    parsed_groups = parse_groups(groups)
    if scenario not in VALID_SCENARIOS:
        raise ValueError("scenario 必须为 two-sided、lower 或 upper。")
    if not 0 < p_target < 1 or not 0 < conf_target < 1:
        raise ValueError("覆盖率和置信度必须在 0 和 1 之间。")

    group_stats = []
    pooled_ss = 0.0
    pooled_df = 0
    for group in parsed_groups:
        samples = np.array(group["samples"], dtype=float)
        if not np.all(np.isfinite(samples)):
            raise ValueError(f"{group['label']} 包含空值、无穷大或非数字。")
        n = len(samples)
        mean = float(np.mean(samples))
        std = float(np.std(samples, ddof=1))
        if std <= 0:
            raise ValueError(f"{group['label']} 的样本标准差必须大于 0。")
        pooled_ss += (n - 1) * std * std
        pooled_df += n - 1
        group_stats.append({"label": group["label"], "samples": samples, "n": n, "mean": mean, "std": std})

    pooled_std = float(np.sqrt(pooled_ss / pooled_df))
    rows = []
    first_ltl = float("-inf")
    first_utl = float("inf")
    first_k = None
    for item in group_stats:
        n = item["n"]
        mean = item["mean"]
        if scenario in {"lower", "upper"}:
            z_p = norm.ppf(p_target)
            nc = z_p * np.sqrt(n)
            k_factor = float(nct.ppf(conf_target, pooled_df, nc) / np.sqrt(n))
            ltl = mean - k_factor * pooled_std if scenario == "lower" else float("-inf")
            utl = mean + k_factor * pooled_std if scenario == "upper" else float("inf")
        else:
            k_factor = two_sided_k_factor_with_df(n, pooled_df, p_target, conf_target, two_sided_method)
            ltl = mean - k_factor * pooled_std
            utl = mean + k_factor * pooled_std
        passed, reasons = evaluate_specs(scenario, ltl, utl, lsl, usl)
        if first_k is None:
            first_k = k_factor
            first_ltl = ltl
            first_utl = utl
        rows.append(
            {
                "label": item["label"],
                "samples": [float(sample) for sample in item["samples"]],
                "n": n,
                "mean": mean,
                "group_std": item["std"],
                "k_factor": k_factor,
                "ltl": finite_or_none(ltl),
                "utl": finite_or_none(utl),
                "passed": passed,
                "verdict": build_verdict(passed, reasons),
                "plot": build_plot(item["samples"], mean, pooled_std, scenario, ltl, utl, lsl, usl),
            }
        )

    group_passed = [row["passed"] for row in rows]
    if all(item is True for item in group_passed):
        overall_passed: bool | None = True
        overall_verdict = "合格：所有分组统计容差边界满足当前规格。"
    elif any(item is False for item in group_passed):
        overall_passed = False
        overall_verdict = "不合格：至少一个分组统计容差边界不满足当前规格。"
    else:
        overall_passed = None
        overall_verdict = "已按多组共同方差分别评价各组。"

    return {
        "method": "normal-pooled",
        "title_label": title_label or "产品特性",
        "scenario": scenario,
        "n": int(sum(item["n"] for item in group_stats)),
        "group_count": len(group_stats),
        "pooled_df": pooled_df,
        "mean": float(np.mean([item["mean"] for item in group_stats])),
        "std": pooled_std,
        "p_target": p_target,
        "conf_target": conf_target,
        "k_factor": first_k,
        "ltl": finite_or_none(first_ltl),
        "utl": finite_or_none(first_utl),
        "lsl": lsl,
        "usl": usl,
        "passed": overall_passed,
        "verdict": overall_verdict,
        "claim": {"label": "分组结论", "text": "见分组结果"},
        "groups": rows,
        "plot": rows[0]["plot"],
    }


def run_distribution_free_validation(
    data: Iterable[float],
    p_target: float = 0.95,
    conf_target: float = 0.95,
    scenario: str = "two-sided",
    rank_mode: str = "vw",
    v: int | None = None,
    w: int | None = None,
    r: int | None = None,
    s: int | None = None,
    lsl: float | None = None,
    usl: float | None = None,
    title_label: str = "产品特性",
) -> dict[str, object]:
    samples = np.array(list(data), dtype=float)
    if len(samples) < 2:
        raise ValueError("自由分布法样本量 n 至少需要 2。")
    if not np.all(np.isfinite(samples)):
        raise ValueError("样本数据不能包含空值、无穷大或非数字。")
    if scenario not in VALID_SCENARIOS:
        raise ValueError("scenario 必须为 two-sided、lower 或 upper。")
    ordered = np.sort(samples)
    n = len(ordered)

    if scenario == "lower":
        v = int(v or r or 1)
        r = v
        s = n
        w = 1
    elif scenario == "upper":
        w = int(w or (n - int(s) + 1 if s else 1))
        s = n - w + 1
        r = 1
        v = 1
    else:
        if rank_mode == "rs":
            r = int(r or 1)
            s = int(s or n)
            v = r
            w = n - s + 1
        else:
            v = int(v or 1)
            w = int(w or 1)
            r = v
            s = n - w + 1

    if scenario == "lower" and not (1 <= r <= n):
        raise ValueError("下限自由分布法必须满足 1 ≤ r ≤ n。")
    if scenario == "upper" and not (1 <= s <= n):
        raise ValueError("上限自由分布法必须满足 1 ≤ s ≤ n。")
    if scenario == "two-sided" and not (1 <= r < s <= n):
        raise ValueError("双侧自由分布法必须满足 1 ≤ r < s ≤ n；等价地 1 ≤ v, 1 ≤ w, v + w ≤ n。")

    ltl = float(ordered[r - 1]) if scenario in {"lower", "two-sided"} else float("-inf")
    utl = float(ordered[s - 1]) if scenario in {"upper", "two-sided"} else float("inf")
    achieved_conf = distribution_free_confidence(n, p_target, scenario, r, s)
    passed, reasons = evaluate_specs(scenario, ltl, utl, lsl, usl)
    verdict = build_verdict(passed, reasons)
    if achieved_conf < conf_target:
        verdict = append_sentence(verdict, f"当前阶次达到的置信度为 {achieved_conf:.3%}，低于目标 {conf_target:.3%}。")

    return {
        "method": "distribution-free",
        "title_label": title_label or "产品特性",
        "scenario": scenario,
        "n": n,
        "mean": float(np.mean(samples)),
        "std": float(np.std(samples, ddof=1)),
        "p_target": p_target,
        "conf_target": conf_target,
        "achieved_conf": achieved_conf,
        "rank_mode": rank_mode,
        "v": v,
        "w": w,
        "r": r,
        "s": s,
        "k_factor": None,
        "ltl": finite_or_none(ltl),
        "utl": finite_or_none(utl),
        "lsl": lsl,
        "usl": usl,
        "passed": passed if achieved_conf >= conf_target else False,
        "verdict": verdict,
        "claim": build_claim(scenario, ltl, utl),
        "plot": build_plot(samples, float(np.mean(samples)), float(np.std(samples, ddof=1)), scenario, ltl, utl, lsl, usl),
    }


def distribution_free_confidence(n: int, p_target: float, scenario: str, r: int, s: int) -> float:
    if scenario == "upper":
        return float(1 - beta.cdf(p_target, s, n - s + 1))
    if scenario == "lower":
        return float(beta.cdf(1 - p_target, r, n - r + 1))
    return float(1 - beta.cdf(p_target, s - r, n - s + r + 1))


@lru_cache(maxsize=512)
def two_sided_k_factor(n: int, p_target: float, conf_target: float, method: str = "fast") -> float:
    return two_sided_k_factor_with_df(n, n - 1, p_target, conf_target, method)


@lru_cache(maxsize=512)
def two_sided_k_factor_with_df(n: int, df: int, p_target: float, conf_target: float, method: str = "fast") -> float:
    if method == "exact":
        return exact_two_sided_k_factor_with_df(n, df, p_target, conf_target)
    return approximate_two_sided_k_factor_with_df(n, df, p_target, conf_target)


def approximate_two_sided_k_factor_with_df(n: int, df: int, p_target: float, conf_target: float) -> float:
    alpha = 1 - conf_target
    z_half = norm.ppf((1 + p_target) / 2)
    chi2_val = chi2.ppf(alpha, df)
    correction = 1 + (df - chi2_val) / (2 * n * (df + 1))
    return float(z_half * np.sqrt((1 + 1 / n) * df / chi2_val) * correction)


def exact_two_sided_k_factor_with_df(
    n: int,
    df: int,
    p_target: float,
    conf_target: float,
    timeout_seconds: float = 30.0,
) -> float:
    deadline = time.monotonic() + timeout_seconds
    z_half = float(norm.ppf((1 + p_target) / 2))

    def check_timeout() -> None:
        if time.monotonic() > deadline:
            raise ValueError("精确双侧计算耗时过长，已自动停止。请改用快速算法，或降低样本组数后重试。")

    def probability(k_factor: float) -> float:
        def integrand(v: float) -> float:
            check_timeout()
            half_width = k_factor * np.sqrt(v / df)
            if half_width <= z_half:
                return 0.0

            def centered_coverage(center_offset: float) -> float:
                return norm.cdf(center_offset + half_width) - norm.cdf(center_offset - half_width) - p_target

            upper = max(8.0, half_width + 8.0)
            allowed_center = brentq(centered_coverage, 0.0, upper, xtol=1e-10, rtol=1e-10)
            conditional_probability = 2 * norm.cdf(np.sqrt(n) * allowed_center) - 1
            return conditional_probability * chi2.pdf(v, df)

        value, _ = quad(integrand, 0.0, np.inf, epsabs=1e-9, epsrel=1e-8, limit=120)
        return float(value)

    alpha = 1 - conf_target
    chi2_val = chi2.ppf(alpha, df)
    approximate = z_half * np.sqrt((1 + 1 / n) * df / chi2_val)
    lower = z_half
    upper = max(approximate * 1.25, z_half * 1.25)
    while probability(upper) < conf_target:
        check_timeout()
        upper *= 1.5

    return float(brentq(lambda k: (check_timeout() or probability(k) - conf_target), lower, upper, xtol=1e-8, rtol=1e-8))


def evaluate_specs(
    scenario: str,
    ltl: float,
    utl: float,
    lsl: float | None,
    usl: float | None,
) -> tuple[bool | None, list[str]]:
    if lsl is None and usl is None:
        return None, []

    reasons: list[str] = []
    if scenario in {"lower", "two-sided"} and lsl is not None and ltl < lsl:
        reasons.append(f"LTL {ltl:.3f} 低于 LSL {lsl:.3f}")
    if scenario in {"upper", "two-sided"} and usl is not None and utl > usl:
        reasons.append(f"UTL {utl:.3f} 高于 USL {usl:.3f}")
    return len(reasons) == 0, reasons


def build_verdict(passed: bool | None, reasons: list[str]) -> str:
    if passed is None:
        return "未配置 LSL/USL，仅输出可宣称容差边界。"
    if passed:
        return "合格：统计容差边界满足当前规格。"
    return "不合格：" + "；".join(reasons)


def append_sentence(base: str, sentence: str) -> str:
    if not base:
        return sentence
    if base.endswith(("。", "！", "？")):
        return base + sentence
    return base + "。" + sentence


def build_claim(scenario: str, ltl: float, utl: float) -> dict[str, float | str | None]:
    if scenario == "lower":
        return {"type": "minimum", "label": "建议最低宣称值", "value": ltl, "text": f">= {ltl:.3f}"}
    if scenario == "upper":
        return {"type": "maximum", "label": "建议最高宣称值", "value": utl, "text": f"<= {utl:.3f}"}
    return {
        "type": "range",
        "label": "建议双侧宣称范围",
        "lower": ltl,
        "upper": utl,
        "text": f"{ltl:.3f} ~ {utl:.3f}",
    }


def build_plot(
    samples: np.ndarray,
    mean: float,
    std: float,
    scenario: str,
    ltl: float,
    utl: float,
    lsl: float | None,
    usl: float | None,
) -> dict[str, object]:
    if std <= 0:
        std = max(abs(mean) * 0.01, 1.0)
    bounds = [mean - 4.5 * std, mean + 4.5 * std, float(np.min(samples)), float(np.max(samples))]
    if lsl is not None:
        bounds.append(lsl + std)
        bounds.append(lsl - std)
    if usl is not None:
        bounds.append(usl - std)
        bounds.append(usl + std)
    if isfinite(ltl):
        bounds.append(ltl - std * 0.4)
    if isfinite(utl):
        bounds.append(utl + std * 0.4)

    x_min, x_max = min(bounds), max(bounds)
    xs = np.linspace(x_min, x_max, 220)
    ys = norm.pdf(xs, mean, std)

    markers = [{"key": "mean", "label": "x\u0304", "value": mean, "kind": "mean"}]
    if isfinite(ltl):
        markers.append({"key": "ltl", "label": "LTL", "value": ltl, "kind": "tolerance"})
    if isfinite(utl):
        markers.append({"key": "utl", "label": "UTL", "value": utl, "kind": "tolerance"})
    if lsl is not None and scenario != "upper":
        markers.append({"key": "lsl", "label": "LSL", "value": lsl, "kind": "spec"})
    if usl is not None and scenario != "lower":
        markers.append({"key": "usl", "label": "USL", "value": usl, "kind": "spec"})

    return {
        "x": [float(x) for x in xs],
        "y": [float(y) for y in ys],
        "samples": [float(item) for item in samples],
        "x_min": float(x_min),
        "x_max": float(x_max),
        "y_max": float(np.max(ys)),
        "markers": markers,
    }


def finite_or_none(value: float) -> float | None:
    return value if isfinite(value) else None

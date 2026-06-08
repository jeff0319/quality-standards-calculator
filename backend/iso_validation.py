from __future__ import annotations

from dataclasses import dataclass
from math import isfinite
import re
from typing import Iterable

import numpy as np
from scipy.stats import chi2, nct, norm


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


def run_iso_validation(
    data: Iterable[float],
    p_target: float = 0.95,
    conf_target: float = 0.95,
    scenario: str = "two-sided",
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
        z_p_half = norm.ppf((1 + p_target) / 2)
        chi2_val = chi2.ppf(alpha, df)
        correction = 1 + (df - chi2_val) / (2 * n * (df + 1))
        k_factor = float(z_p_half * np.sqrt((1 + 1 / n) * df / chi2_val) * correction)
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

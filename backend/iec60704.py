from __future__ import annotations

from math import isfinite, sqrt
from statistics import NormalDist, mean, stdev
from typing import Iterable

NORMAL = NormalDist()
REFERENCE_ACCEPTANCE_PROBABILITY = 0.95


def run_iec60704_declaration(
    data: Iterable[float],
    inspection_data: Iterable[float] | None = None,
    n: int = 3,
    p: float = 0.065,
    pa: float = 0.95,
    sigma_m: float = 1.5,
    sigma_r: float = 0.0,
    declared_value: float | None = None,
    title_label: str = "噪声声功率级",
    mode: str = "declaration",
) -> dict[str, object]:
    samples = [float(item) for item in data]
    if len(samples) < 1:
        raise ValueError("请输入至少 1 个噪声测试结果。")
    if not all(isfinite(item) for item in samples):
        raise ValueError("噪声测试结果不能包含空值、无穷大或非数字。")
    if n < 1:
        raise ValueError("验证样本量 n 必须至少为 1。")
    if not 0 < p < 1:
        raise ValueError("质量水平 p₁₋α 必须在 0 和 1 之间。")
    if not 0 < pa < 1:
        raise ValueError("接收概率 Pa 必须在 0 和 1 之间。")
    if not isfinite(sigma_m) or sigma_m < 0:
        raise ValueError("σM 必须为有限且不小于 0 的数。")
    if not isfinite(sigma_r) or sigma_r < 0:
        raise ValueError("σR 必须为有限且不小于 0 的数。")

    sample_mean = float(mean(samples))
    sample_std = float(stdev(samples)) if len(samples) >= 2 else None
    production_std, total_std = calculate_total_std(sample_std, sigma_m, sigma_r)
    coverage = 1 - p

    z_pa = NORMAL.inv_cdf(pa)
    inspection_k_accept = acceptance_k(n, coverage, pa)
    declaration_k_accept = acceptance_k(n, coverage, REFERENCE_ACCEPTANCE_PROBABILITY)
    display_k_accept = inspection_k_accept if mode == "inspection" else declaration_k_accept
    margin_k_sigma = declaration_k_accept * sigma_m
    planning_margin = z_pa / sqrt(n) * total_std
    declaration_margin = margin_k_sigma + planning_margin
    recommended_declared_value = sample_mean + declaration_margin

    inspection_samples = [float(item) for item in inspection_data] if inspection_data is not None else samples
    if not inspection_samples:
        raise ValueError("抽检样本不能为空。")
    if not all(isfinite(item) for item in inspection_samples):
        raise ValueError("抽检样本不能包含空值、无穷大或非数字。")
    inspection_mean = float(mean(inspection_samples))
    inspection_sample_std = float(stdev(inspection_samples)) if len(inspection_samples) >= 2 else None
    _, inspection_total_std = calculate_total_std(inspection_sample_std, sigma_m, sigma_r)

    acceptance_limit = None
    passed = None
    verdict = "未输入现有宣称值，已根据测试均值反向计算推荐宣称值。"
    declared_coverage = None
    declared_accept_probability = None
    if declared_value is not None:
        acceptance_limit = declared_value - inspection_k_accept * sigma_m
        passed = inspection_mean <= acceptance_limit
        declared_coverage = float(NORMAL.cdf((declared_value - inspection_mean) / inspection_total_std))
        declared_accept_probability = oc_acceptance_probability(declared_coverage, n, inspection_k_accept)
        if passed:
            verdict = "通过：抽检样本均值不高于 IEC 60704-3 抽样接受限。"
        else:
            verdict = "不通过：抽检样本均值高于 IEC 60704-3 抽样接受限。"

    return {
        "title_label": title_label or "噪声声功率级",
        "n": n,
        "p": p,
        "coverage": coverage,
        "pa": pa,
        "mean": sample_mean,
        "sample_std": sample_std,
        "production_std": production_std,
        "sigma_m": sigma_m,
        "sigma_r": sigma_r,
        "sigma_t": total_std,
        "k_accept": display_k_accept,
        "declaration_k_accept": declaration_k_accept,
        "inspection_k_accept": inspection_k_accept,
        "reference_acceptance_probability": REFERENCE_ACCEPTANCE_PROBABILITY,
        "acceptance_margin": inspection_k_accept * sigma_m,
        "margin_k_sigma": margin_k_sigma,
        "planning_margin": planning_margin,
        "declaration_margin": declaration_margin,
        "recommended_declared_value": recommended_declared_value,
        "declared_value": declared_value,
        "acceptance_limit": acceptance_limit,
        "inspection_n": len(inspection_samples),
        "inspection_mean": inspection_mean,
        "inspection_sample_std": inspection_sample_std,
        "inspection_sigma_t": inspection_total_std,
        "declared_coverage": declared_coverage,
        "declared_accept_probability": declared_accept_probability,
        "passed": passed,
        "verdict": verdict,
        "claim": {
            "label": "推荐宣称值 Lc",
            "value": recommended_declared_value,
            "text": f"{recommended_declared_value:.1f} dB",
        },
        "declaration_table": build_declaration_table(sample_mean, sigma_m, total_std, n, p, pa),
        "oc_plot": build_oc_plot(n, p, pa, inspection_k_accept, declared_coverage),
    }


def calculate_total_std(sample_std: float | None, sigma_m: float, sigma_r: float) -> tuple[float, float]:
    if sample_std is not None and sample_std > 0:
        production_std = sample_std
    elif sigma_m > 0:
        production_std = float(sigma_m)
    else:
        production_std = 1.0
    return production_std, sqrt(production_std * production_std + sigma_r * sigma_r)


def acceptance_k(n: int, p: float, pa: float = 0.95) -> float:
    return float(NORMAL.inv_cdf(p) - NORMAL.inv_cdf(pa) / sqrt(n))


def build_declaration_table(
    sample_mean: float,
    sigma_m: float,
    sigma_t: float,
    n: int,
    selected_p: float,
    selected_pa: float,
) -> list[dict[str, float | str]]:
    p_values = unique_rates([selected_p, 0.1, 0.065, 0.05])
    pa_values = unique_rates([selected_pa, 0.95, 0.99, 0.999])
    rows: list[dict[str, float | str]] = []
    for p in p_values:
        k_factor = acceptance_k(n, 1 - p, REFERENCE_ACCEPTANCE_PROBABILITY)
        for pa in pa_values:
            declaration_margin = k_factor * sigma_m + NORMAL.inv_cdf(pa) / sqrt(n) * sigma_t
            declared_value = sample_mean + declaration_margin
            rows.append(
                {
                    "p": p,
                    "pa": pa,
                    "k_accept": k_factor,
                    "margin": declaration_margin,
                    "declared_value": declared_value,
                    "declared_text": f"{declared_value:.1f} dB",
                }
            )
    return rows


def unique_rates(values: list[float]) -> list[float]:
    result: list[float] = []
    seen: set[int] = set()
    for value in values:
        key = round(value * 1_000_000)
        if key not in seen:
            seen.add(key)
            result.append(value)
    return result


def oc_acceptance_probability(coverage: float, n: int, k_accept: float) -> float:
    clipped = min(max(float(coverage), 1e-9), 1 - 1e-9)
    return float(NORMAL.cdf(sqrt(n) * (NORMAL.inv_cdf(clipped) - k_accept)))


def build_oc_plot(
    n: int,
    p: float,
    pa: float,
    k_accept: float,
    declared_coverage: float | None,
) -> dict[str, object]:
    bad_rates = [0.0 + 0.5 * index / 259 for index in range(260)]
    coverages = [1 - item for item in bad_rates]
    acceptances = [oc_acceptance_probability(item, n, k_accept) for item in coverages]
    boundary_coverage = 1 - p
    boundary_acceptance = oc_acceptance_probability(boundary_coverage, n, k_accept)
    markers = [
        {"key": "boundary", "label": f"{p * 100:.1f}% / {pa * 100:.1f}%", "x": p, "y": boundary_acceptance, "kind": "boundary"},
    ]
    if declared_coverage is not None:
        markers.append(
            {
                "key": "declared",
                "label": "当前 Lc",
                "x": 1 - declared_coverage,
                "y": oc_acceptance_probability(declared_coverage, n, k_accept),
                "kind": "declared",
            }
        )

    return {
        "x": [float(item) for item in bad_rates],
        "y": [float(item) for item in acceptances],
        "x_min": 0.0,
        "x_max": 0.5,
        "y_min": 0.0,
        "y_max": 1.0,
        "markers": markers,
    }

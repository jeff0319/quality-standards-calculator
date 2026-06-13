from __future__ import annotations

import os
from pathlib import Path
import time

from flask import Flask, jsonify, render_template, request

from backend.iec60704 import run_iec60704_declaration
from backend.iso_16269 import run_distribution_free_validation, run_iso_validation, run_pooled_validation
from backend.parsing import parse_samples


PROJECT_ROOT = Path(__file__).resolve().parent

app = Flask(
    __name__,
    template_folder=str(PROJECT_ROOT / "frontend" / "templates"),
    static_folder=str(PROJECT_ROOT / "frontend" / "static"),
    static_url_path="/static",
)
templates_auto_reload = os.getenv("TEMPLATES_AUTO_RELOAD")
if templates_auto_reload is not None:
    app.config["TEMPLATES_AUTO_RELOAD"] = templates_auto_reload.lower() in {"1", "true", "yes"}


@app.get("/")
def index():
    return render_template("home.html")


@app.get("/iso-16269-6")
def iso16269():
    return render_template("iso16269.html")


@app.get("/iec-60704-3")
def iec60704():
    return render_template("iec60704.html")


@app.post("/api/iso-16269-6")
@app.post("/api/validate")
def iso16269_api():
    payload = request.get_json(silent=True) or {}
    started_at = time.perf_counter()
    try:
        method = payload.get("method", "normal-single")
        common_args = dict(
            p_target=float(payload.get("p_target", 0.95)),
            conf_target=float(payload.get("conf_target", 0.95)),
            scenario=payload.get("scenario", "two-sided"),
            lsl=optional_float(payload.get("lsl")),
            usl=optional_float(payload.get("usl")),
            title_label=payload.get("title_label") or "产品特性",
        )
        two_sided_method = payload.get("two_sided_method", "fast")
        if two_sided_method not in {"fast", "exact"}:
            two_sided_method = "fast"
        reproducibility_std = optional_float(payload.get("reproducibility_std")) or 0.0
        if method == "normal-pooled":
            result = run_pooled_validation(
                groups=payload.get("groups", []),
                two_sided_method=two_sided_method,
                reproducibility_std=reproducibility_std,
                **common_args,
            )
            return jsonify(with_elapsed(result, started_at))
        if method == "distribution-free":
            result = run_distribution_free_validation(
                data=parse_samples(payload.get("samples", "")),
                rank_mode=payload.get("rank_mode", "vw"),
                v=optional_int(payload.get("v")),
                w=optional_int(payload.get("w")),
                r=optional_int(payload.get("r")),
                s=optional_int(payload.get("s")),
                **common_args,
            )
            return jsonify(with_elapsed(result, started_at))
        result = run_iso_validation(
            data=parse_samples(payload.get("samples", "")),
            two_sided_method=two_sided_method,
            reproducibility_std=reproducibility_std,
            **common_args,
        )
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    return jsonify(with_elapsed(result.to_dict(), started_at))


@app.post("/api/iec-60704-3")
def iec60704_api():
    payload = request.get_json(silent=True) or {}
    started_at = time.perf_counter()
    try:
        declaration_samples = payload.get("declaration_samples") or payload.get("samples", "")
        inspection_samples_raw = payload.get("inspection_samples")
        inspection_samples = parse_samples(inspection_samples_raw) if str(inspection_samples_raw or "").strip() else None
        result = run_iec60704_declaration(
            data=parse_samples(declaration_samples),
            inspection_data=inspection_samples,
            n=int(payload.get("n", 3)),
            p=percent_or_rate(payload.get("p", 0.065)),
            pa=percent_or_rate(payload.get("pa", 0.95)),
            sigma_m=float(payload.get("sigma_m", 1.5)),
            sigma_r=optional_float(payload.get("sigma_r")) or 0.0,
            declared_value=optional_float(payload.get("declared_value")),
            title_label=payload.get("title_label") or "噪声声功率级",
            mode=payload.get("tool_mode") or "declaration",
        )
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    return jsonify(with_elapsed(result, started_at))


@app.get("/health")
def health():
    return jsonify({"status": "ok"})


def optional_float(value):
    if value is None or value == "":
        return None
    return float(value)


def percent_or_rate(value):
    number = float(value)
    return number / 100 if number > 1 else number


def optional_int(value):
    if value is None or value == "":
        return None
    return int(value)


def with_elapsed(result: dict[str, object], started_at: float) -> dict[str, object]:
    result["elapsed_ms"] = round((time.perf_counter() - started_at) * 1000, 1)
    return result


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.getenv("PORT", "8018")), debug=True)

from __future__ import annotations

import os
from pathlib import Path

from flask import Flask, jsonify, render_template, request

from backend.iso_validation import parse_samples, run_distribution_free_validation, run_iso_validation, run_pooled_validation


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
    return render_template("index.html")


@app.post("/api/validate")
def validate():
    payload = request.get_json(silent=True) or {}
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
        if method == "normal-pooled":
            result = run_pooled_validation(groups=payload.get("groups", []), **common_args)
            return jsonify(result)
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
            return jsonify(result)
        result = run_iso_validation(data=parse_samples(payload.get("samples", "")), **common_args)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    return jsonify(result.to_dict())


@app.get("/health")
def health():
    return jsonify({"status": "ok"})


def optional_float(value):
    if value is None or value == "":
        return None
    return float(value)


def optional_int(value):
    if value is None or value == "":
        return None
    return int(value)


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.getenv("PORT", "8018")), debug=True)

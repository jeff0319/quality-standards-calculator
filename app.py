from __future__ import annotations

from pathlib import Path

from flask import Flask, jsonify, render_template, request

from backend.iso_validation import parse_samples, run_iso_validation


PROJECT_ROOT = Path(__file__).resolve().parent

app = Flask(
    __name__,
    template_folder=str(PROJECT_ROOT / "frontend" / "templates"),
    static_folder=str(PROJECT_ROOT / "frontend" / "static"),
    static_url_path="/static",
)


@app.get("/")
def index():
    return render_template("index.html")


@app.post("/api/validate")
def validate():
    payload = request.get_json(silent=True) or {}
    try:
        result = run_iso_validation(
            data=parse_samples(payload.get("samples", "")),
            p_target=float(payload.get("p_target", 0.95)),
            conf_target=float(payload.get("conf_target", 0.95)),
            scenario=payload.get("scenario", "two-sided"),
            lsl=optional_float(payload.get("lsl")),
            usl=optional_float(payload.get("usl")),
            title_label=payload.get("title_label") or "产品特性",
        )
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


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8000, debug=True)

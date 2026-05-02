import base64
import os
from pathlib import Path

import cv2
import numpy as np
from flask import Flask, jsonify, request

from read_plate import (
    DEFAULT_MODEL,
    DEFAULT_OCR_DIR,
    DEFAULT_PADDLE_CACHE_DIR,
    get_paddleocr_reader,
    load_detector,
    recognize_plate_in_image,
)


def decode_base64_image(image_base64):
    try:
        image_bytes = base64.b64decode(image_base64)
        image_array = np.frombuffer(image_bytes, dtype=np.uint8)
        image = cv2.imdecode(image_array, cv2.IMREAD_COLOR)
    except Exception:
        return None
    return image


def create_app():
    app = Flask(__name__)
    app.config["PLATE_MODEL_PATH"] = os.getenv("PLATE_MODEL_PATH", str(DEFAULT_MODEL))
    app.config["PLATE_CONFIDENCE"] = float(os.getenv("PLATE_CONFIDENCE", "0.20"))
    app.config["PLATE_OCR_LANGS"] = [item.strip() for item in os.getenv("PLATE_OCR_LANGS", "en,ar").split(",") if item.strip()]
    app.config["PLATE_OCR_DIR"] = os.getenv("PLATE_OCR_DIR", str(DEFAULT_OCR_DIR))
    app.config["PLATE_OCR_ENGINE"] = os.getenv("PLATE_OCR_ENGINE", "paddle").strip().lower() or "paddle"
    app.config["PLATE_PADDLE_CACHE_DIR"] = os.getenv("PLATE_PADDLE_CACHE_DIR", str(DEFAULT_PADDLE_CACHE_DIR))
    app.config["PLATE_PRELOAD_MODELS"] = os.getenv("PLATE_PRELOAD_MODELS", "true").strip().lower() not in {"0", "false", "no"}

    if app.config["PLATE_PRELOAD_MODELS"]:
        model_path = Path(app.config["PLATE_MODEL_PATH"])
        if model_path.exists():
            load_detector(model_path)

        if app.config["PLATE_OCR_ENGINE"] in {"auto", "paddle"}:
            get_paddleocr_reader(app.config["PLATE_PADDLE_CACHE_DIR"])

    @app.get("/health")
    def health():
        model_path = Path(app.config["PLATE_MODEL_PATH"])
        return jsonify(
            {
                "status": "ok",
                "service": "plate-recognition",
                "model_path": str(model_path),
                "model_exists": model_path.exists(),
                "ocr_dir": app.config["PLATE_OCR_DIR"],
                "langs": app.config["PLATE_OCR_LANGS"],
                "ocr_engine": app.config["PLATE_OCR_ENGINE"],
            }
        )

    @app.post("/recognize-plate")
    def recognize_plate():
        payload = request.get_json(silent=True) or {}
        image_base64 = payload.get("image_base64")
        if not image_base64:
            return jsonify({"status": "error", "error": "image_base64 is required"}), 400

        image = decode_base64_image(image_base64)
        if image is None:
            return jsonify({"status": "error", "error": "Invalid base64 image payload"}), 400

        model_path = Path(app.config["PLATE_MODEL_PATH"])
        if not model_path.exists():
            return jsonify({"status": "error", "error": f"Model not found: {model_path}"}), 500

        try:
            result = recognize_plate_in_image(
                image=image,
                model_path=model_path,
                conf=float(app.config["PLATE_CONFIDENCE"]),
                languages=app.config["PLATE_OCR_LANGS"],
                ocr_dir=app.config["PLATE_OCR_DIR"],
                ocr_engine=app.config["PLATE_OCR_ENGINE"],
                paddle_cache_dir=app.config["PLATE_PADDLE_CACHE_DIR"],
            )
        except Exception as exc:
            return jsonify(
                {
                    "status": "error",
                    "error": str(exc),
                    "error_type": exc.__class__.__name__,
                }
            ), 500

        result["parking_id"] = payload.get("parking_id")
        result["place_id"] = payload.get("place_id")
        result["source_id"] = payload.get("source_id")
        result["captured_at"] = payload.get("captured_at")
        return jsonify(result), 200

    return app


app = create_app()


if __name__ == "__main__":
    host = os.getenv("PLATE_API_HOST", "0.0.0.0")
    port = int(os.getenv("PORT", os.getenv("PLATE_API_PORT", "8001")))
    app.run(host=host, port=port, debug=False)

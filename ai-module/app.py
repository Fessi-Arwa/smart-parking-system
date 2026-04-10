from __future__ import annotations

import json
import os
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import urlopen
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from flask import Flask, flash, jsonify, redirect, render_template, request, send_from_directory, url_for
from werkzeug.utils import secure_filename

from process_video import ParkingVideoProcessor, is_parking_classifier, resolve_existing_path


BASE_DIR = Path(__file__).resolve().parent
INPUT_DIR = BASE_DIR / "uploads" / "input"
OUTPUT_DIR = BASE_DIR / "uploads" / "output"
CALIBRATION_DIR = BASE_DIR / "uploads" / "calibration"
DATA_DIR = BASE_DIR / "data"
HISTORY_PATH = DATA_DIR / "history.json"
CALIBRATION_STATE_PATH = DATA_DIR / "calibration_state.json"
LOCAL_SLOTS_PATH = BASE_DIR / "slots.json"

EXTERNAL_AI_DIR = Path(os.getenv("SMART_PARKING_SOURCE_DIR", r"C:\Users\marie\smart parking"))
MODEL_CANDIDATES = [
    Path(os.getenv("SMART_PARKING_MODEL_PATH", "")),
    EXTERNAL_AI_DIR / "runs" / "classify" / "train" / "weights" / "best.pt",
    BASE_DIR / "model" / "yolov8.pt",
    EXTERNAL_AI_DIR / "yolov8n-cls.pt",
]
SLOTS_CANDIDATES = [
    Path(os.getenv("SMART_PARKING_SLOTS_PATH", "")),
    LOCAL_SLOTS_PATH,
    EXTERNAL_AI_DIR / "slots.json",
]
ALLOWED_EXTENSIONS = {".mp4", ".mov", ".avi", ".mkv", ".m4v"}
ALLOWED_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}
BACKEND_API_BASE = os.getenv("SMART_PARKING_API_BASE", "http://127.0.0.1:5000/api").rstrip("/")


app = Flask(__name__, template_folder=str(BASE_DIR / "templates"))
app.config["SECRET_KEY"] = os.getenv("SMART_PARKING_SECRET", "smart-parking-dev-secret")
app.config["MAX_CONTENT_LENGTH"] = 1024 * 1024 * 1024


def ensure_storage() -> None:
    for directory in (INPUT_DIR, OUTPUT_DIR, CALIBRATION_DIR, DATA_DIR):
        directory.mkdir(parents=True, exist_ok=True)
    if not HISTORY_PATH.exists():
        HISTORY_PATH.write_text("[]", encoding="utf-8")
    if not CALIBRATION_STATE_PATH.exists():
        CALIBRATION_STATE_PATH.write_text("{}", encoding="utf-8")


def load_history() -> list[dict]:
    ensure_storage()
    try:
        history = json.loads(HISTORY_PATH.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        history = []
    return history if isinstance(history, list) else []


def save_history(history: list[dict]) -> None:
    HISTORY_PATH.write_text(json.dumps(history[:100], indent=2), encoding="utf-8")


def load_slots_config() -> list[dict]:
    if not LOCAL_SLOTS_PATH.exists():
        return []

    try:
        slots = json.loads(LOCAL_SLOTS_PATH.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return []

    return slots if isinstance(slots, list) else []


def save_slots_config(slots: list[dict]) -> None:
    LOCAL_SLOTS_PATH.write_text(json.dumps(slots, indent=2), encoding="utf-8")


def load_calibration_state() -> dict:
    ensure_storage()
    try:
        state = json.loads(CALIBRATION_STATE_PATH.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        state = {}
    return state if isinstance(state, dict) else {}


def save_calibration_state(state: dict) -> None:
    CALIBRATION_STATE_PATH.write_text(json.dumps(state, indent=2), encoding="utf-8")


def fetch_parking_places(parking_id: int) -> list[dict]:
    query = urlencode({"parking_id": parking_id})
    url = f"{BACKEND_API_BASE}/places/?{query}"
    try:
        with urlopen(url, timeout=10) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except HTTPError as exc:
        raise RuntimeError(f"Le backend a renvoye HTTP {exc.code} pour le parking {parking_id}.") from exc
    except URLError as exc:
        raise RuntimeError("Impossible de joindre le backend pour charger les places.") from exc
    except json.JSONDecodeError as exc:
        raise RuntimeError("La reponse du backend n'est pas un JSON valide.") from exc

    if not isinstance(payload, list):
        raise RuntimeError("Le backend a renvoye un format inattendu pour les places.")

    normalized_places: list[dict] = []
    for item in payload:
        if not isinstance(item, dict):
            continue
        place_id = item.get("id_place")
        num_place = item.get("num_place")
        if place_id is None or num_place is None:
            continue
        normalized_places.append(
            {
                "id_place": int(place_id),
                "num_place": int(num_place),
                "etat": item.get("etat"),
                "zone": item.get("zone"),
                "etage": item.get("etage"),
            }
        )

    return normalized_places


def get_processor() -> tuple[ParkingVideoProcessor, Path, Path]:
    model_candidates = [path for path in MODEL_CANDIDATES if str(path)]
    existing_model_candidates = [
        path for path in model_candidates if path.exists() and path.is_file() and path.stat().st_size > 0
    ]
    model_path = next(
        (path for path in existing_model_candidates if is_parking_classifier(path)),
        resolve_existing_path(model_candidates, "model"),
    )
    slots_path = resolve_existing_path([path for path in SLOTS_CANDIDATES if str(path)], "slots")
    processor = ParkingVideoProcessor(model_path=model_path, slots_path=slots_path)
    return processor, model_path, slots_path


def allowed_video(filename: str) -> bool:
    return Path(filename).suffix.lower() in ALLOWED_EXTENSIONS


def allowed_image(filename: str) -> bool:
    return Path(filename).suffix.lower() in ALLOWED_IMAGE_EXTENSIONS


def build_media_urls(items: list[dict]) -> list[dict]:
    enriched: list[dict] = []
    for item in items:
        enriched.append(
            {
                **item,
                "video_url": url_for("serve_output", filename=item["output_filename"]),
                "download_url": url_for("download_output", filename=item["output_filename"]),
            }
        )
    return enriched


@app.route("/", methods=["GET"])
def index():
    history = build_media_urls(load_history())
    latest_batch = request.args.get("latest")
    recent_results = []
    if latest_batch:
        recent_results = [item for item in history if item.get("batch_id") == latest_batch]
    calibration_state = load_calibration_state()
    calibration_filename = calibration_state.get("image_filename")
    calibration_image_url = (
        url_for("serve_calibration_image", filename=calibration_filename) if calibration_filename else None
    )
    calibration_parking_id = calibration_state.get("parking_id")
    calibration_places = []
    calibration_places_error = None
    if calibration_parking_id:
        try:
            calibration_places = fetch_parking_places(int(calibration_parking_id))
        except Exception as exc:  # pragma: no cover - surfaced in UI
            calibration_places_error = str(exc)

    config_error = None
    model_path = None
    slots_path = None
    slots_count = 0
    try:
        processor, model_path, slots_path = get_processor()
        slots_count = len(processor.slots)
    except Exception as exc:  # pragma: no cover - surfaced in UI
        config_error = str(exc)

    return render_template(
        "index.html",
        history=history,
        recent_results=recent_results,
        config_error=config_error,
        model_path=model_path,
        slots_path=slots_path,
        slots_count=slots_count,
        max_history=len(history),
        calibration_image_url=calibration_image_url,
        calibration_parking_id=calibration_parking_id,
        calibration_places=calibration_places,
        calibration_places_error=calibration_places_error,
        current_slots=load_slots_config(),
    )


@app.route("/process", methods=["POST"])
def process_videos():
    files = [file for file in request.files.getlist("videos") if file and file.filename]
    if not files:
        flash("Ajoute au moins une video a traiter.", "error")
        return redirect(url_for("index"))

    try:
        processor, model_path, slots_path = get_processor()
    except Exception as exc:
        flash(str(exc), "error")
        return redirect(url_for("index"))

    batch_id = uuid4().hex
    history = load_history()
    new_entries: list[dict] = []

    for file in files:
        filename = secure_filename(file.filename)
        if not filename:
            flash("Un fichier a un nom invalide et a ete ignore.", "error")
            continue

        if not allowed_video(filename):
            flash(f"{filename}: format video non pris en charge.", "error")
            continue

        input_filename = f"{uuid4().hex}_{filename}"
        output_filename = f"{Path(input_filename).stem}_annotated.mp4"
        input_path = INPUT_DIR / input_filename
        output_path = OUTPUT_DIR / output_filename

        file.save(input_path)

        try:
            result = processor.process(input_path=input_path, output_path=output_path)
        except Exception as exc:
            input_path.unlink(missing_ok=True)
            output_path.unlink(missing_ok=True)
            flash(f"{filename}: {exc}", "error")
            continue

        entry = {
            **result.to_dict(),
            "batch_id": batch_id,
            "source_filename": filename,
            "processed_at": datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds"),
            "model_path": str(model_path),
            "slots_path": str(slots_path),
        }
        new_entries.append(entry)

    if not new_entries:
        flash("Aucune video n'a pu etre traitee.", "error")
        return redirect(url_for("index"))

    history = sorted(new_entries + history, key=lambda item: item["processed_at"], reverse=True)
    save_history(history)
    flash(f"{len(new_entries)} video(s) traitee(s) avec succes.", "success")
    return redirect(url_for("index", latest=batch_id))


@app.route("/calibration/upload-image", methods=["POST"])
def upload_calibration_image():
    file = request.files.get("image")
    parking_id_raw = (request.form.get("parking_id") or "").strip()
    if not file or not file.filename:
        flash("Ajoute une image de reference pour calibrer les places.", "error")
        return redirect(url_for("index"))

    filename = secure_filename(file.filename)
    if not filename or not allowed_image(filename):
        flash("Format image non pris en charge. Utilise JPG, PNG ou WEBP.", "error")
        return redirect(url_for("index"))

    stored_filename = f"{uuid4().hex}_{filename}"
    file.save(CALIBRATION_DIR / stored_filename)
    parking_id = None
    if parking_id_raw:
        try:
            parking_id = int(parking_id_raw)
        except ValueError:
            flash("parking_id invalide. Utilise un identifiant numerique.", "error")
            return redirect(url_for("index"))
    save_calibration_state(
        {
            "image_filename": stored_filename,
            "parking_id": parking_id,
            "updated_at": datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds"),
        }
    )
    flash("Image de calibration chargee. Dessine maintenant les rectangles des places.", "success")
    return redirect(url_for("index"))


@app.route("/calibration/parking", methods=["POST"])
def save_calibration_parking():
    parking_id_raw = (request.form.get("parking_id") or "").strip()
    if not parking_id_raw:
        flash("Ajoute un parking_id pour charger les places du backend.", "error")
        return redirect(url_for("index"))

    try:
        parking_id = int(parking_id_raw)
    except ValueError:
        flash("parking_id invalide. Utilise un identifiant numerique.", "error")
        return redirect(url_for("index"))

    state = load_calibration_state()
    state["parking_id"] = parking_id
    state["updated_at"] = datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")
    save_calibration_state(state)

    try:
        places = fetch_parking_places(parking_id)
    except Exception as exc:
        flash(str(exc), "error")
        return redirect(url_for("index"))

    flash(f"{len(places)} place(s) chargee(s) pour le parking {parking_id}.", "success")
    return redirect(url_for("index"))


@app.route("/calibration/save-slots", methods=["POST"])
def save_calibration_slots():
    payload = request.get_json(silent=True) or {}
    slots = payload.get("slots")
    if not isinstance(slots, list):
        return jsonify({"error": "Le champ slots doit etre une liste."}), 400

    normalized_slots: list[dict] = []
    seen_place_ids: set[int] = set()
    for index, slot in enumerate(slots, start=1):
        if not isinstance(slot, dict):
            return jsonify({"error": f"Le slot #{index} doit etre un objet."}), 400

        try:
            x = int(slot["x"])
            y = int(slot["y"])
            w = int(slot["w"])
            h = int(slot["h"])
        except (KeyError, TypeError, ValueError):
            return jsonify({"error": f"Le slot #{index} doit contenir x, y, w et h entiers."}), 400

        if w <= 0 or h <= 0:
            return jsonify({"error": f"Le slot #{index} doit avoir une largeur et une hauteur positives."}), 400

        place_id_value = slot.get("place_id")
        place_id = None
        if place_id_value not in (None, ""):
            try:
                place_id = int(place_id_value)
            except (TypeError, ValueError):
                return jsonify({"error": f"Le slot #{index} doit avoir un place_id entier."}), 400
            if place_id <= 0:
                return jsonify({"error": f"Le slot #{index} doit avoir un place_id positif."}), 400
            if place_id in seen_place_ids:
                return jsonify({"error": f"Le place_id {place_id} est utilise plusieurs fois."}), 400
            seen_place_ids.add(place_id)

        normalized_slots.append(
            {
                "slot_index": index,
                "place_id": place_id,
                "x": x,
                "y": y,
                "w": w,
                "h": h,
            }
        )

    save_slots_config(normalized_slots)
    return jsonify({"saved": len(normalized_slots), "slots_path": str(LOCAL_SLOTS_PATH)}), 200


@app.route("/images/calibration/<path:filename>", methods=["GET"])
def serve_calibration_image(filename: str):
    return send_from_directory(CALIBRATION_DIR, filename)


@app.route("/videos/output/<path:filename>", methods=["GET"])
def serve_output(filename: str):
    return send_from_directory(OUTPUT_DIR, filename)


@app.route("/download/<path:filename>", methods=["GET"])
def download_output(filename: str):
    return send_from_directory(OUTPUT_DIR, filename, as_attachment=True)


if __name__ == "__main__":
    ensure_storage()
    app.run(debug=True)

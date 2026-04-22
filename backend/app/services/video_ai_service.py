from __future__ import annotations

import json
import os
from concurrent.futures import Future, ThreadPoolExecutor
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from functools import lru_cache
from pathlib import Path
from typing import Any
from uuid import uuid4

import cv2
from ultralytics import YOLO
from werkzeug.utils import secure_filename


FREE_LABEL = "free"
BUSY_LABEL = "busy"
FREE_LABEL_ALIASES = {"free", "empty", "vacant", "available", "libre"}
BUSY_LABEL_ALIASES = {"busy", "occupied", "full", "taken", "occupee", "occupé"}


@dataclass
class ParkingVideoResult:
    id: str
    parking_id: int
    source_filename: str
    stored_input_filename: str
    output_filename: str
    processed_at: str
    free: int
    occupied: int
    total: int
    processed_frames: int
    fps: float
    resolution: str
    class_mapping: dict[str, str]
    slot_states: list[str]
    slot_debug: list[dict[str, Any]]
    model_path: str
    slots_path: str

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def resolve_existing_file(candidates: list[Path], label: str) -> Path:
    for path in candidates:
        if str(path).strip() and path.exists() and path.is_file() and path.stat().st_size > 0:
            return path
    checked = "\n".join(str(path) for path in candidates if str(path).strip())
    raise FileNotFoundError(f"No valid {label} file found. Checked:\n{checked}")


def load_slots(slots_path: Path) -> list[dict[str, int | None]]:
    with slots_path.open("r", encoding="utf-8") as handle:
        slots = json.load(handle)

    if not isinstance(slots, list) or not slots:
        raise ValueError(
            "slots.json must contain a non-empty list of slot rectangles, for example "
            '[{"place_id": 12, "x": 120, "y": 80, "w": 90, "h": 160}].'
        )

    normalized: list[dict[str, int | None]] = []
    for index, slot in enumerate(slots, start=1):
        try:
            x = int(slot["x"])
            y = int(slot["y"])
            w = int(slot["w"])
            h = int(slot["h"])
        except (KeyError, TypeError, ValueError) as exc:
            raise ValueError(
                f"Slot #{index} must contain integer x, y, w and h values."
            ) from exc

        if w <= 0 or h <= 0:
            raise ValueError(f"Slot #{index} must have positive width and height.")

        place_id_value = slot.get("place_id")
        place_id = None
        if place_id_value not in (None, ""):
            try:
                place_id = int(place_id_value)
            except (TypeError, ValueError) as exc:
                raise ValueError(f"Slot #{index} has an invalid place_id.") from exc
            if place_id <= 0:
                raise ValueError(f"Slot #{index} must have a positive place_id.")

        place_number_value = slot.get("place_number")
        place_number = None
        if place_number_value not in (None, ""):
            try:
                place_number = int(place_number_value)
            except (TypeError, ValueError) as exc:
                raise ValueError(f"Slot #{index} has an invalid place_number.") from exc

        normalized.append(
            {
                "slot_index": index,
                "place_id": place_id,
                "place_number": place_number,
                "x": x,
                "y": y,
                "w": w,
                "h": h,
            }
        )

    return normalized


def save_slots(slots_path: Path, slots: list[dict[str, Any]]) -> None:
    slots_path.parent.mkdir(parents=True, exist_ok=True)
    slots_path.write_text(json.dumps(slots, indent=2), encoding="utf-8")


@lru_cache(maxsize=2)
def load_model(model_path: str) -> YOLO:
    return YOLO(model_path)


def is_parking_classifier(model_path: Path) -> bool:
    try:
        names = load_model(str(model_path)).names
    except Exception:
        return False

    normalized = {
        normalized_label
        for value in getattr(names, "values", lambda: [])()
        for normalized_label in [_normalize_parking_label(str(value))]
        if normalized_label
    }
    return FREE_LABEL in normalized and BUSY_LABEL in normalized


def _normalize_parking_label(label: str) -> str | None:
    normalized = str(label or "").strip().lower().replace("-", "_").replace(" ", "_")
    if normalized in FREE_LABEL_ALIASES:
        return FREE_LABEL
    if normalized in BUSY_LABEL_ALIASES:
        return BUSY_LABEL
    return None


class ParkingVideoAIService:
    _job_executor = ThreadPoolExecutor(max_workers=max(1, int(os.getenv("SMART_PARKING_MAX_BATCH_JOBS", "2"))))
    _jobs: dict[str, Future] = {}

    def __init__(self, upload_root: str, flask_app: Any | None = None) -> None:
        self.flask_app = flask_app
        self.backend_root = Path(__file__).resolve().parents[2]
        self.upload_root = Path(upload_root)
        self.ai_root = self.upload_root / "ai_batch"
        self.slots_root = self.upload_root / "ai_slots"
        self.input_root = self.ai_root / "input"
        self.output_root = self.ai_root / "output"
        self.history_path = self.ai_root / "history.json"
        self.jobs_path = self.ai_root / "jobs.json"

        external_ai_dir = Path(
            os.getenv("SMART_PARKING_SOURCE_DIR", r"C:\Users\marie\smart parking")
        )
        model_candidates = [
            Path(os.getenv("SMART_PARKING_MODEL_PATH", "")),
            external_ai_dir / "runs" / "classify" / "train" / "weights" / "best.pt",
            self.backend_root.parent / "ai-module" / "model" / "yolov8.pt",
            external_ai_dir / "yolov8n-cls.pt",
        ]
        valid_model_candidates = [
            path
            for path in model_candidates
            if str(path).strip() and path.exists() and path.is_file() and path.stat().st_size > 0
        ]
        self.model_path = next(
            (path for path in valid_model_candidates if is_parking_classifier(path)),
            resolve_existing_file(model_candidates, "model"),
        )
        self.default_slots_path = resolve_existing_file(
            [
                Path(os.getenv("SMART_PARKING_SLOTS_PATH", "")),
                self.backend_root.parent / "ai-module" / "slots.json",
                external_ai_dir / "slots.json",
            ],
            "slots",
        )
        self.model = load_model(str(self.model_path))
        # Match the standalone ai-module defaults so backend and local runs
        # produce the same crops and classification behavior unless explicitly overridden.
        self.frame_stride = max(1, int(os.getenv("SMART_PARKING_VIDEO_FRAME_STRIDE", "1")))
        self.classify_imgsz = max(96, int(os.getenv("SMART_PARKING_CLASSIFY_IMGSZ", "160")))
        self.slot_padding_ratio = max(0.0, float(os.getenv("SMART_PARKING_SLOT_PADDING_RATIO", "0.0")))
        self.debug_enabled = os.getenv("SMART_PARKING_AI_DEBUG", "").strip().lower() in {"1", "true", "yes", "on"}
        self._ensure_storage()

    def get_slots_config_path(self, parking_id: int) -> Path:
        return self.slots_root / f"{parking_id}.json"

    def get_slots_path(self, parking_id: int) -> Path:
        parking_slots_path = self.get_slots_config_path(parking_id)
        if parking_slots_path.exists() and parking_slots_path.is_file() and parking_slots_path.stat().st_size > 0:
            return parking_slots_path
        return self.default_slots_path

    def get_slots(self, parking_id: int) -> tuple[list[dict[str, int | None]], Path]:
        slots_path = self.get_slots_path(parking_id)
        try:
            return load_slots(slots_path), slots_path
        except (ValueError, json.JSONDecodeError):
            parking_slots_path = self.get_slots_config_path(parking_id)
            if slots_path == parking_slots_path:
                return load_slots(self.default_slots_path), self.default_slots_path
            raise

    def save_parking_slots(self, parking_id: int, slots: list[dict[str, Any]]) -> Path:
        slots_path = self.get_slots_config_path(parking_id)
        save_slots(slots_path, slots)
        return slots_path

    def get_saved_parking_slots(self, parking_id: int) -> list[dict[str, Any]]:
        slots_path = self.get_slots_config_path(parking_id)
        if not slots_path.exists():
            return []
        try:
            data = json.loads(slots_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            return []
        return data if isinstance(data, list) else []

    def process_video(self, parking_id: int, input_path: Path, source_filename: str) -> ParkingVideoResult:
        slots, slots_path = self.get_slots(parking_id)
        self._log_debug(
            "video-process-start parking_id=%s source=%s model=%s slots=%s imgsz=%s padding=%s frame_stride=%s total_slots=%s",
            parking_id,
            source_filename,
            self.model_path,
            slots_path,
            self.classify_imgsz,
            self.slot_padding_ratio,
            self.frame_stride,
            len(slots),
        )
        cap = cv2.VideoCapture(str(input_path))
        if not cap.isOpened():
            raise RuntimeError(f"Unable to open video: {source_filename}")

        fps = float(cap.get(cv2.CAP_PROP_FPS) or 25.0)
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 0)
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0)
        if width <= 0 or height <= 0:
            cap.release()
            raise RuntimeError("The uploaded video has an invalid resolution.")

        class_mapping: dict[str, str] = {}
        slot_votes = [{FREE_LABEL: 0, BUSY_LABEL: 0} for _ in slots]
        slot_confidence_sum = [0.0 for _ in slots]
        slot_inference_count = [0 for _ in slots]
        latest_states = [BUSY_LABEL for _ in slots]
        latest_confidences = [0.0 for _ in slots]
        processed_frames = 0
        frame_index = 0

        try:
            while True:
                ok, frame = cap.read()
                if not ok:
                    break

                should_infer = frame_index % self.frame_stride == 0
                if should_infer:
                    for slot_index, slot in enumerate(slots, start=1):
                        prediction = self._predict_slot(frame, slot)
                        class_mapping.update(prediction["class_mapping"])
                        label = prediction["label"]
                        confidence = float(prediction["confidence"])
                        latest_states[slot_index - 1] = label
                        latest_confidences[slot_index - 1] = confidence
                        is_free = label == FREE_LABEL
                        slot_votes[slot_index - 1][FREE_LABEL if is_free else BUSY_LABEL] += 1
                        slot_confidence_sum[slot_index - 1] += confidence
                        slot_inference_count[slot_index - 1] += 1
                    processed_frames += 1
                frame_index += 1
        finally:
            cap.release()

        if processed_frames == 0:
            raise RuntimeError("The uploaded video does not contain readable frames.")

        final_states = list(latest_states)
        average_confidences = [
            round(slot_confidence_sum[index] / slot_inference_count[index], 4)
            if slot_inference_count[index] > 0
            else 0.0
            for index in range(len(slots))
        ]
        slot_debug = []
        for index, (slot, state, votes) in enumerate(zip(slots, final_states, slot_votes), start=1):
            inference_count = slot_inference_count[index - 1]
            average_confidence = (
                round(slot_confidence_sum[index - 1] / inference_count, 4)
                if inference_count > 0
                else None
            )
            slot_debug.append(
                {
                    "slot_index": index,
                    "place_id": slot.get("place_id"),
                    "label": state,
                    "average_confidence": average_confidence,
                    "free_votes": votes[FREE_LABEL],
                    "busy_votes": votes[BUSY_LABEL],
                    "x": slot["x"],
                    "y": slot["y"],
                    "w": slot["w"],
                    "h": slot["h"],
                }
            )
        free = sum(state == FREE_LABEL for state in final_states)
        total = len(final_states)
        occupied = total - free

        result_id = uuid4().hex
        parking_output_dir = self.output_root / str(parking_id)
        parking_output_dir.mkdir(parents=True, exist_ok=True)
        output_filename, output_path, writer = self._create_video_writer(
            parking_output_dir=parking_output_dir,
            result_id=result_id,
            fps=fps,
            width=width,
            height=height,
        )

        render_cap = cv2.VideoCapture(str(input_path))
        if not render_cap.isOpened():
            raise RuntimeError(f"Unable to reopen video for rendering: {source_filename}")

        try:
            render_frame_index = 0
            render_states = [BUSY_LABEL for _ in slots]
            render_confidences = [0.0 for _ in slots]
            while True:
                ok, frame = render_cap.read()
                if not ok:
                    break

                should_infer = render_frame_index % self.frame_stride == 0
                if should_infer:
                    for slot_index, slot in enumerate(slots, start=1):
                        prediction = self._predict_slot(frame, slot)
                        label = prediction["label"]
                        confidence = float(prediction["confidence"])
                        render_states[slot_index - 1] = label
                        render_confidences[slot_index - 1] = confidence

                current_free = sum(label == FREE_LABEL for label in render_states)
                current_occupied = len(render_states) - current_free
                for slot_index, slot in enumerate(slots, start=1):
                    label = render_states[slot_index - 1]
                    confidence = render_confidences[slot_index - 1]
                    is_free = label == FREE_LABEL
                    self._draw_slot(
                        frame=frame,
                        slot=slot,
                        slot_index=slot_index,
                        label=label,
                        confidence=confidence,
                        is_free=is_free,
                    )

                self._draw_header(frame, current_free, current_occupied, total, "Smart Parking Real-time Analysis")
                writer.write(frame)
                render_frame_index += 1
        finally:
            render_cap.release()
            writer.release()

        result = ParkingVideoResult(
            id=result_id,
            parking_id=parking_id,
            source_filename=source_filename,
            stored_input_filename=input_path.name,
            output_filename=output_filename,
            processed_at=datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds"),
            free=free,
            occupied=occupied,
            total=total,
            processed_frames=processed_frames,
            fps=round(fps, 2),
            resolution=f"{width}x{height}",
            class_mapping=class_mapping,
            slot_states=final_states,
            slot_debug=slot_debug,
            model_path=str(self.model_path),
            slots_path=str(slots_path),
        )
        self._save_history_entry(result)
        return result

    def _create_video_writer(
        self,
        parking_output_dir: Path,
        result_id: str,
        fps: float,
        width: int,
        height: int,
    ) -> tuple[str, Path, cv2.VideoWriter]:
        candidates = [
            ("avc1", ".mp4"),
            ("H264", ".mp4"),
            ("X264", ".mp4"),
            ("mp4v", ".mp4"),
        ]

        for codec, extension in candidates:
            output_filename = f"{result_id}_annotated{extension}"
            output_path = parking_output_dir / output_filename
            writer = cv2.VideoWriter(
                str(output_path),
                cv2.VideoWriter_fourcc(*codec),
                fps,
                (width, height),
            )
            if writer.isOpened():
                return output_filename, output_path, writer
            writer.release()
            output_path.unlink(missing_ok=True)

        raise RuntimeError(
            "Impossible de creer une video annotee lisible. Aucun codec video compatible n est disponible sur ce serveur."
        )

    def get_history(self, parking_id: int) -> list[dict[str, Any]]:
        return [
            self._attach_urls(entry)
            for entry in self._read_history()
            if int(entry.get("parking_id", -1)) == parking_id
        ]

    def enqueue_batch_job(self, parking_id: int, files: list[Any]) -> dict[str, Any]:
        if not self.flask_app:
            raise RuntimeError("Batch async processing requires a Flask app context.")

        allowed_extensions = {".mp4", ".mov", ".avi", ".mkv", ".m4v"}
        stored_inputs: list[dict[str, str]] = []
        for file in files:
            safe_name = secure_filename(file.filename or "")
            if not safe_name:
                raise ValueError("Nom de fichier invalide")

            extension = Path(safe_name).suffix.lower()
            if extension not in allowed_extensions:
                raise ValueError(f"{file.filename}: Format video non pris en charge")

            input_path = self.save_uploaded_file(parking_id, safe_name, file)
            stored_inputs.append(
                {
                    "source_filename": file.filename,
                    "stored_input_path": str(input_path),
                }
            )

        job_id = uuid4().hex
        timestamp = datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")
        job = {
            "id": job_id,
            "parking_id": parking_id,
            "status": "pending",
            "created_at": timestamp,
            "started_at": None,
            "completed_at": None,
            "total_files": len(stored_inputs),
            "processed_files": 0,
            "success_count": 0,
            "error_count": 0,
            "results": [],
            "errors": [],
            "inputs": stored_inputs,
        }
        self._upsert_job(job)
        future = self._job_executor.submit(self._run_batch_job, job_id)
        self._jobs[job_id] = future
        return self._attach_job_urls(job)

    def get_batch_job(self, parking_id: int, job_id: str) -> dict[str, Any] | None:
        for job in self._read_jobs():
            if job.get("id") == job_id and int(job.get("parking_id", -1)) == parking_id:
                return self._attach_job_urls(job)
        return None

    def get_result_by_id(self, parking_id: int, result_id: str) -> dict[str, Any] | None:
        for entry in self._read_history():
            if entry.get("id") == result_id and int(entry.get("parking_id", -1)) == parking_id:
                return self._attach_urls(entry)
        return None

    def resolve_output_path(self, parking_id: int, result_id: str) -> Path | None:
        entry = self.get_result_by_id(parking_id, result_id)
        if not entry:
            return None
        path = self.output_root / str(parking_id) / entry["output_filename"]
        return path if path.exists() else None

    def save_uploaded_file(self, parking_id: int, source_filename: str, content: Any) -> Path:
        parking_input_dir = self.input_root / str(parking_id)
        parking_input_dir.mkdir(parents=True, exist_ok=True)
        stored_name = f"{uuid4().hex}_{source_filename}"
        input_path = parking_input_dir / stored_name
        content.save(input_path)
        return input_path

    def _ensure_storage(self) -> None:
        for directory in (self.ai_root, self.slots_root, self.input_root, self.output_root):
            directory.mkdir(parents=True, exist_ok=True)
        if not self.history_path.exists():
            self.history_path.write_text("[]", encoding="utf-8")
        if not self.jobs_path.exists():
            self.jobs_path.write_text("[]", encoding="utf-8")

    def _read_history(self) -> list[dict[str, Any]]:
        try:
            history = json.loads(self.history_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            history = []
        return history if isinstance(history, list) else []

    def _save_history_entry(self, result: ParkingVideoResult) -> None:
        history = self._read_history()
        history.insert(0, result.to_dict())
        self.history_path.write_text(json.dumps(history[:200], indent=2), encoding="utf-8")

    def _read_jobs(self) -> list[dict[str, Any]]:
        try:
            jobs = json.loads(self.jobs_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            jobs = []
        return jobs if isinstance(jobs, list) else []

    def _upsert_job(self, job: dict[str, Any]) -> None:
        jobs = self._read_jobs()
        kept = [item for item in jobs if item.get("id") != job.get("id")]
        kept.insert(0, job)
        self.jobs_path.write_text(json.dumps(kept[:100], indent=2), encoding="utf-8")

    def _attach_urls(self, entry: dict[str, Any]) -> dict[str, Any]:
        parking_id = entry["parking_id"]
        result_id = entry["id"]
        return {
            **entry,
            "video_url": f"/api/ai/parkings/{parking_id}/video-results/{result_id}/stream",
            "download_url": f"/api/ai/parkings/{parking_id}/video-results/{result_id}/download",
        }

    def _attach_job_urls(self, job: dict[str, Any]) -> dict[str, Any]:
        results = [self._attach_urls(result) for result in job.get("results", [])]
        return {**job, "results": results}

    def _run_batch_job(self, job_id: str) -> None:
        if not self.flask_app:
            return

        with self.flask_app.app_context():
            job = next((item for item in self._read_jobs() if item.get("id") == job_id), None)
            if not job:
                return

            job["status"] = "processing"
            job["started_at"] = datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")
            self._upsert_job(job)

            try:
                results: list[dict[str, Any]] = []
                errors: list[dict[str, str]] = []
                processed_files = 0

                for item in job.get("inputs", []):
                    source_filename = item.get("source_filename", "video")
                    input_path = Path(item.get("stored_input_path", ""))
                    try:
                        result = self.process_video(int(job["parking_id"]), input_path, source_filename)
                        results.append(result.to_dict())
                    except Exception as exc:
                        input_path.unlink(missing_ok=True)
                        errors.append({"filename": source_filename, "error": str(exc)})

                    processed_files += 1
                    job["processed_files"] = processed_files
                    job["success_count"] = len(results)
                    job["error_count"] = len(errors)
                    job["results"] = results
                    job["errors"] = errors
                    self._upsert_job(job)

                job["completed_at"] = datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")
                job["status"] = "done" if results else "error"
                job["results"] = results
                job["errors"] = errors
                self._upsert_job(job)
            except Exception as exc:
                job["completed_at"] = datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")
                job["status"] = "error"
                job["errors"] = [{"filename": None, "error": str(exc)}]
                self._upsert_job(job)
            finally:
                self._jobs.pop(job_id, None)

    def _predict_slot(self, frame: Any, slot: dict[str, int]) -> dict[str, Any]:
        x, y, w, h = slot["x"], slot["y"], slot["w"], slot["h"]
        frame_height, frame_width = frame.shape[:2]
        pad_x = int(round(w * self.slot_padding_ratio))
        pad_y = int(round(h * self.slot_padding_ratio))
        x1 = max(0, x - pad_x)
        y1 = max(0, y - pad_y)
        x2 = min(frame_width, x + w + pad_x)
        y2 = min(frame_height, y + h + pad_y)
        crop = frame[y1:y2, x1:x2]
        self._log_slot_debug(slot, x1, y1, x2, y2, frame_width, frame_height)
        if crop.size == 0:
            return {"label": BUSY_LABEL, "confidence": 0.0, "class_mapping": {}}

        result = self.model.predict(crop, imgsz=self.classify_imgsz, verbose=False)[0]
        probs = getattr(result, "probs", None)
        names = self._normalize_names(result.names)
        if probs is None:
            raise RuntimeError("Le modele IA configure ne retourne pas de probabilites de classification exploitables.")

        cls_id = int(probs.top1)
        raw_label = names.get(str(cls_id), "")
        label = _normalize_parking_label(raw_label)
        if label is None:
            raise RuntimeError(
                "Le modele IA configure n est pas compatible avec la detection free/busy des places."
            )

        return {
            "label": label,
            "confidence": float(probs.top1conf),
            "class_mapping": names,
        }

    def _log_debug(self, message: str, *args: Any) -> None:
        if not self.debug_enabled:
            return
        if self.flask_app:
            self.flask_app.logger.info(message, *args)

    def _log_slot_debug(
        self,
        slot: dict[str, int],
        x1: int,
        y1: int,
        x2: int,
        y2: int,
        frame_width: int,
        frame_height: int,
    ) -> None:
        if not self.debug_enabled:
            return
        self._log_debug(
            "slot-crop slot_index=%s place_id=%s rect=(%s,%s,%s,%s) crop=(%s,%s)-(%s,%s) frame=%sx%s",
            slot.get("slot_index"),
            slot.get("place_id"),
            slot["x"],
            slot["y"],
            slot["w"],
            slot["h"],
            x1,
            y1,
            x2,
            y2,
            frame_width,
            frame_height,
        )

    @staticmethod
    def _normalize_names(names: Any) -> dict[str, str]:
        if isinstance(names, dict):
            return {str(key): str(value) for key, value in names.items()}
        return {}

    @staticmethod
    def _draw_slot(
        frame: Any,
        slot: dict[str, int],
        slot_index: int,
        label: str,
        confidence: float,
        is_free: bool,
    ) -> None:
        x, y, w, h = slot["x"], slot["y"], slot["w"], slot["h"]
        color = (46, 204, 113) if is_free else (52, 73, 94)
        slot_label = (
            f"Place {slot.get('place_number')}"
            if slot.get("place_number")
            else (f"P{slot.get('place_id')}" if slot.get("place_id") else f"S{slot_index}")
        )

        cv2.rectangle(frame, (x, y), (x + w, y + h), color, 3)
        cv2.rectangle(frame, (x, max(0, y - 28)), (x + 190, y), color, -1)
        cv2.putText(
            frame,
            f"{slot_label} {label} {confidence:.2f}",
            (x + 8, max(18, y - 8)),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.55,
            (255, 255, 255),
            2,
            cv2.LINE_AA,
        )

    @staticmethod
    def _draw_header(frame: Any, free: int, occupied: int, total: int) -> None:
        x1, y1, x2, y2 = 20, 20, 450, 110
        roi = frame[y1:y2, x1:x2]
        if roi.size:
            overlay = roi.copy()
            cv2.rectangle(overlay, (0, 0), (x2 - x1, y2 - y1), (18, 24, 38), -1)
            cv2.addWeighted(overlay, 0.75, roi, 0.25, 0, roi)
        cv2.putText(frame, f"Free: {free}", (36, 58), cv2.FONT_HERSHEY_SIMPLEX, 0.9, (46, 204, 113), 2, cv2.LINE_AA)
        cv2.putText(frame, f"Occupied: {occupied}", (160, 58), cv2.FONT_HERSHEY_SIMPLEX, 0.9, (255, 193, 7), 2, cv2.LINE_AA)
        cv2.putText(frame, f"Total: {total}", (336, 58), cv2.FONT_HERSHEY_SIMPLEX, 0.9, (255, 255, 255), 2, cv2.LINE_AA)
        cv2.putText(
            frame,
            "Smart Parking Batch Analysis",
            (36, 92),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.6,
            (214, 224, 240),
            1,
            cv2.LINE_AA,
        )

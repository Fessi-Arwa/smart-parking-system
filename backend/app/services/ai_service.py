from __future__ import annotations

import json
import os
from concurrent.futures import Future, ThreadPoolExecutor
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import cv2
from flask import current_app

from .. import db
from ..models.place import Place, StatutPlace
from ..models.parking_ai_source import ParkingAISource, TypeSourceIA
from .video_ai_service import (
    BUSY_LABEL,
    FREE_LABEL,
    ParkingVideoAIService,
    is_parking_classifier,
    load_slots,
    load_model,
    resolve_existing_file,
)


@dataclass
class ParkingSourceAnalysisResult:
    source_id: int
    parking_id: int
    source_type: str
    status: str
    processed_at: str
    free: int | None = None
    occupied: int | None = None
    total: int | None = None
    processed_frames: int | None = None
    fps: float | None = None
    resolution: str | None = None
    class_mapping: dict[str, str] | None = None
    slot_debug: list[dict[str, Any]] | None = None
    model_path: str | None = None
    slots_path: str | None = None
    sync_mode: str | None = None
    synced_places: int | None = None
    sync_warning: str | None = None
    output_path: str | None = None
    output_filename: str | None = None
    output_mimetype: str | None = None
    output_preview_path: str | None = None
    output_preview_filename: str | None = None
    output_preview_mimetype: str | None = None
    error: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


class ParkingSourceAIService:
    _executor = ThreadPoolExecutor(max_workers=max(1, int(os.getenv("SMART_PARKING_MAX_VIDEO_JOBS", "2"))))
    _video_jobs: dict[int, Future] = {}

    def __init__(self, upload_root: str) -> None:
        self.flask_app = current_app._get_current_object()
        self.backend_root = Path(__file__).resolve().parents[2]
        self.upload_root = Path(upload_root)
        self.analysis_root = self.upload_root / "ai_source_analysis"
        self.output_root = self.analysis_root / "output"
        self.calibration_root = self.analysis_root / "calibration_frames"
        self.history_path = self.analysis_root / "history.json"

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
        self.video_service = ParkingVideoAIService(upload_root)
        self.classify_imgsz = max(96, int(os.getenv("SMART_PARKING_CLASSIFY_IMGSZ", "192")))
        self.slot_padding_ratio = max(0.0, float(os.getenv("SMART_PARKING_SLOT_PADDING_RATIO", "0.12")))
        self._ensure_storage()

    def analyze_source(self, source: ParkingAISource) -> dict[str, Any]:
        source_type = source.source_type.value if isinstance(source.source_type, TypeSourceIA) else str(source.source_type)
        if source_type == TypeSourceIA.camera.value:
            return self.record_error(
                source_id=source.id_source,
                parking_id=source.parking_id,
                source_type=source_type,
                error="Le traitement automatique n'est pas disponible pour les cameras.",
            )

        file_path = Path(source.file_path or "")
        if not file_path.exists():
            return self.record_error(
                source_id=source.id_source,
                parking_id=source.parking_id,
                source_type=source_type,
                error="Le fichier source est introuvable.",
            )

        if source_type == TypeSourceIA.image.value:
            result = self._analyze_image(source, file_path)
        elif source_type == TypeSourceIA.video.value:
            result = self._analyze_video(source, file_path)
        else:
            result = self.record_error(
                source_id=source.id_source,
                parking_id=source.parking_id,
                source_type=source_type,
                error="Type de source IA non pris en charge.",
            )
            return result

        self._upsert_history_entry(result.to_dict())
        return self._attach_output_url(result.to_dict())

    def enqueue_video_analysis(self, source: ParkingAISource) -> dict[str, Any]:
        source_type = source.source_type.value if isinstance(source.source_type, TypeSourceIA) else str(source.source_type)
        if source_type != TypeSourceIA.video.value:
            return self.analyze_source(source)

        current = self.get_analysis(source.id_source)
        if current and current.get("status") in {"pending", "processing"}:
            return current

        pending = self._build_status_result(
            source_id=source.id_source,
            parking_id=source.parking_id,
            source_type=source_type,
            status="pending",
        )
        self._upsert_history_entry(pending.to_dict())
        future = self._executor.submit(self._run_video_analysis_job, source.id_source)
        self._video_jobs[source.id_source] = future
        return self._attach_output_url(pending.to_dict())

    def get_analysis(self, source_id: int) -> dict[str, Any] | None:
        for entry in self._read_history():
            if int(entry.get("source_id", -1)) == source_id:
                return self._attach_output_url(entry)
        return None

    def delete_analysis(self, source_id: int) -> None:
        history = self._read_history()
        kept: list[dict[str, Any]] = []
        for entry in history:
            if int(entry.get("source_id", -1)) == source_id:
                output_path = entry.get("output_path")
                if output_path:
                    Path(output_path).unlink(missing_ok=True)
                continue
            kept.append(entry)
        self.history_path.write_text(json.dumps(kept, indent=2), encoding="utf-8")

    def resolve_output_path(self, source_id: int) -> tuple[Path | None, str | None]:
        entry = self.get_analysis(source_id)
        if not entry:
            return None, None

        output_path = entry.get("output_path")
        if not output_path:
            return None, None

        path = Path(output_path)
        if not path.exists():
            return None, None
        return path, entry.get("output_mimetype")

    def resolve_output_preview_path(self, source_id: int) -> tuple[Path | None, str | None]:
        entry = self.get_analysis(source_id)
        if not entry:
            return None, None

        output_path = entry.get("output_preview_path")
        if not output_path:
            return None, None

        path = Path(output_path)
        if not path.exists():
            return None, None
        return path, entry.get("output_preview_mimetype")

    def _run_video_analysis_job(self, source_id: int) -> None:
        with self.flask_app.app_context():
            source = ParkingAISource.query.get(source_id)
            if not source:
                return

            processing = self._build_status_result(
                source_id=source.id_source,
                parking_id=source.parking_id,
                source_type=source.source_type.value,
                status="processing",
            )
            self._upsert_history_entry(processing.to_dict())

            try:
                result = self._analyze_video(source, Path(source.file_path or ""))
                self._upsert_history_entry(result.to_dict())
            except Exception as exc:
                self.record_error(
                    source_id=source.id_source,
                    parking_id=source.parking_id,
                    source_type=source.source_type.value,
                    error=str(exc),
                )
            finally:
                self._video_jobs.pop(source_id, None)

    def extract_calibration_frame(self, source: ParkingAISource) -> tuple[Path | None, str | None]:
        source_type = source.source_type.value if isinstance(source.source_type, TypeSourceIA) else str(source.source_type)
        if source_type == TypeSourceIA.image.value:
            path = Path(source.file_path or "")
            if not path.exists():
                return None, None
            return path, source.mime_type or "image/jpeg"

        if source_type != TypeSourceIA.video.value:
            return None, None

        file_path = Path(source.file_path or "")
        if not file_path.exists():
            return None, None

        output_dir = self.calibration_root / str(source.parking_id)
        output_dir.mkdir(parents=True, exist_ok=True)
        output_path = output_dir / f"source_{source.id_source}_frame.jpg"

        if output_path.exists() and output_path.stat().st_mtime >= file_path.stat().st_mtime:
            return output_path, "image/jpeg"

        cap = cv2.VideoCapture(str(file_path))
        if not cap.isOpened():
            return None, None

        frame = None
        try:
            total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
            candidate_positions = []
            if total_frames > 0:
                candidate_positions = [
                    0,
                    max(0, total_frames // 10),
                    max(0, total_frames // 4),
                    max(0, total_frames // 2),
                ]

            for position in candidate_positions:
                cap.set(cv2.CAP_PROP_POS_FRAMES, position)
                ok, candidate = cap.read()
                if ok and candidate is not None:
                    frame = candidate
                    break

            if frame is None:
                cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                ok, candidate = cap.read()
                if ok and candidate is not None:
                    frame = candidate
        finally:
            cap.release()

        if frame is None:
            return None, None

        if not cv2.imwrite(str(output_path), frame):
            return None, None

        return output_path, "image/jpeg"

    def record_error(self, source_id: int, parking_id: int, source_type: str, error: str) -> dict[str, Any]:
        slots_path = self.video_service.get_slots_path(parking_id)
        result = ParkingSourceAnalysisResult(
            source_id=source_id,
            parking_id=parking_id,
            source_type=source_type,
            status="error",
            processed_at=datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds"),
            class_mapping={},
            model_path=str(self.model_path) if getattr(self, "model_path", None) else None,
            slots_path=str(slots_path) if slots_path else None,
            error=error,
        )
        self._upsert_history_entry(result.to_dict())
        return self._attach_output_url(result.to_dict())

    def _build_status_result(
        self,
        source_id: int,
        parking_id: int,
        source_type: str,
        status: str,
    ) -> ParkingSourceAnalysisResult:
        slots_path = self.video_service.get_slots_path(parking_id)
        return ParkingSourceAnalysisResult(
            source_id=source_id,
            parking_id=parking_id,
            source_type=source_type,
            status=status,
            processed_at=datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds"),
            class_mapping={},
            model_path=str(self.model_path) if getattr(self, "model_path", None) else None,
            slots_path=str(slots_path) if slots_path else None,
        )

    def _analyze_image(self, source: ParkingAISource, file_path: Path) -> ParkingSourceAnalysisResult:
        slots, slots_path = self.video_service.get_slots(source.parking_id)
        frame = cv2.imread(str(file_path))
        if frame is None:
            raise RuntimeError("Impossible de lire cette image.")

        height, width = frame.shape[:2]
        free_count = 0
        occupied_count = 0
        class_mapping: dict[str, str] = {}
        slot_states: list[str] = []

        for slot_index, slot in enumerate(slots, start=1):
            prediction = self._predict_slot(frame, slot)
            class_mapping.update(prediction["class_mapping"])
            is_free = prediction["label"] == FREE_LABEL
            slot_states.append(FREE_LABEL if is_free else BUSY_LABEL)

            if is_free:
                free_count += 1
            else:
                occupied_count += 1

            self._draw_slot(
                frame=frame,
                slot=slot,
                slot_index=slot_index,
                label=prediction["label"],
                confidence=prediction["confidence"],
                is_free=is_free,
            )

        self._draw_header(frame, free_count, occupied_count, len(slots), "Smart Parking Image Analysis")
        parking_output_dir = self.output_root / str(source.parking_id)
        parking_output_dir.mkdir(parents=True, exist_ok=True)
        output_filename = f"source_{source.id_source}_annotated.jpg"
        output_path = parking_output_dir / output_filename

        if not cv2.imwrite(str(output_path), frame):
            raise RuntimeError("Impossible d'ecrire l'image annotee.")

        sync_result = self._sync_places_with_slots(source.parking_id, slots, slot_states)
        slot_debug = [
            {
                "slot_index": index,
                "place_id": slot.get("place_id"),
                "label": state,
                "average_confidence": None,
                "x": slot["x"],
                "y": slot["y"],
                "w": slot["w"],
                "h": slot["h"],
            }
            for index, (slot, state) in enumerate(zip(slots, slot_states), start=1)
        ]

        return ParkingSourceAnalysisResult(
            source_id=source.id_source,
            parking_id=source.parking_id,
            source_type=TypeSourceIA.image.value,
            status="done",
            processed_at=datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds"),
            free=free_count,
            occupied=occupied_count,
            total=len(slots),
            resolution=f"{width}x{height}",
            class_mapping=class_mapping,
            slot_debug=slot_debug,
            model_path=str(self.model_path),
            slots_path=str(slots_path),
            sync_mode=sync_result["mode"],
            synced_places=sync_result["synced_places"],
            sync_warning=sync_result["warning"],
            output_path=str(output_path),
            output_filename=output_filename,
            output_mimetype="image/jpeg",
        )

    def _analyze_video(self, source: ParkingAISource, file_path: Path) -> ParkingSourceAnalysisResult:
        video_result = self.video_service.process_video(
            parking_id=source.parking_id,
            input_path=file_path,
            source_filename=source.original_name or file_path.name,
        )
        output_path = self.video_service.resolve_output_path(source.parking_id, video_result.id)
        preview_path = self._extract_video_output_preview(source.parking_id, source.id_source, output_path)
        slots, _ = self.video_service.get_slots(source.parking_id)
        sync_result = self._sync_places_with_slots(source.parking_id, slots, video_result.slot_states)

        return ParkingSourceAnalysisResult(
            source_id=source.id_source,
            parking_id=source.parking_id,
            source_type=TypeSourceIA.video.value,
            status="done",
            processed_at=video_result.processed_at,
            free=video_result.free,
            occupied=video_result.occupied,
            total=video_result.total,
            processed_frames=video_result.processed_frames,
            fps=video_result.fps,
            resolution=video_result.resolution,
            class_mapping=video_result.class_mapping,
            slot_debug=video_result.slot_debug,
            model_path=video_result.model_path,
            slots_path=video_result.slots_path,
            sync_mode=sync_result["mode"],
            synced_places=sync_result["synced_places"],
            sync_warning=sync_result["warning"],
            output_path=str(output_path) if output_path else None,
            output_filename=video_result.output_filename,
            output_mimetype="video/mp4",
            output_preview_path=str(preview_path) if preview_path else None,
            output_preview_filename=preview_path.name if preview_path else None,
            output_preview_mimetype="image/jpeg" if preview_path else None,
        )

    def _sync_places_with_slots(
        self,
        parking_id: int,
        slots: list[dict[str, Any]],
        slot_states: list[str],
    ) -> dict[str, Any]:
        places = (
            Place.query.filter_by(parking_id=parking_id)
            .order_by(Place.num_place.asc(), Place.id_place.asc())
            .all()
        )

        if not places:
            return {
                "mode": "none",
                "synced_places": 0,
                "warning": "Aucune place en base pour ce parking. Synchronisation ignoree.",
            }

        synced_places = 0
        warning_parts: list[str] = []

        explicit_place_ids = [slot.get("place_id") for slot in slots]
        has_explicit_mapping = any(place_id is not None for place_id in explicit_place_ids)

        if has_explicit_mapping:
            places_by_id = {place.id_place: place for place in places}

            if len(slots) != len(slot_states):
                warning_parts.append(
                    f"Incoherence interne: {len(slot_states)} etat(s) pour {len(slots)} slot(s)."
                )

            for slot, slot_state in zip(slots, slot_states):
                place_id = slot.get("place_id")
                if place_id is None:
                    warning_parts.append(
                        f"Slot #{slot.get('slot_index', '?')} sans place_id. Synchronisation ignoree pour ce slot."
                    )
                    continue

                place = places_by_id.get(int(place_id))
                if not place:
                    warning_parts.append(
                        f"Slot #{slot.get('slot_index', '?')} pointe vers place_id={place_id} introuvable."
                    )
                    continue

                if place.etat == StatutPlace.reservee:
                    continue

                expected_state = StatutPlace.libre if slot_state == FREE_LABEL else StatutPlace.occupee
                if place.etat != expected_state:
                    place.etat = expected_state
                    synced_places += 1

            mode = "explicit-place_id"
        else:
            paired_count = min(len(places), len(slot_states))
            if len(places) != len(slot_states):
                warning_parts.append(
                    f"Synchronisation partielle: {len(slot_states)} slot(s) detecte(s) pour "
                    f"{len(places)} place(s) en base. Mapping applique sur {paired_count} element(s)."
                )

            for index in range(paired_count):
                place = places[index]
                slot_state = slot_states[index]

                if place.etat == StatutPlace.reservee:
                    continue

                expected_state = StatutPlace.libre if slot_state == FREE_LABEL else StatutPlace.occupee
                if place.etat != expected_state:
                    place.etat = expected_state
                    synced_places += 1

            warning_parts.append(
                "slots.json ne contient pas de place_id. Fallback applique par ordre de num_place."
            )
            mode = "ordered-by-num_place"

        db.session.commit()
        return {
            "mode": mode,
            "synced_places": synced_places,
            "warning": " ".join(warning_parts) if warning_parts else None,
        }

    def _ensure_storage(self) -> None:
        for directory in (self.analysis_root, self.output_root, self.calibration_root):
            directory.mkdir(parents=True, exist_ok=True)
        if not self.history_path.exists():
            self.history_path.write_text("[]", encoding="utf-8")

    def _read_history(self) -> list[dict[str, Any]]:
        try:
            history = json.loads(self.history_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            history = []
        return history if isinstance(history, list) else []

    def _upsert_history_entry(self, entry: dict[str, Any]) -> None:
        history = [item for item in self._read_history() if int(item.get("source_id", -1)) != entry["source_id"]]
        history.insert(0, entry)
        self.history_path.write_text(json.dumps(history[:300], indent=2), encoding="utf-8")

    def _attach_output_url(self, entry: dict[str, Any]) -> dict[str, Any]:
        payload = {**entry}
        if entry.get("output_path"):
            payload["output_url"] = f"/api/owner/ai-sources/{entry['source_id']}/analysis-file"
        if entry.get("output_preview_path"):
            payload["output_preview_url"] = f"/api/owner/ai-sources/{entry['source_id']}/analysis-preview"
        return payload

    def _extract_video_output_preview(self, parking_id: int, source_id: int, output_path: Path | None) -> Path | None:
        if not output_path or not output_path.exists():
            return None

        preview_dir = self.output_root / str(parking_id)
        preview_dir.mkdir(parents=True, exist_ok=True)
        preview_path = preview_dir / f"source_{source_id}_annotated_preview.jpg"

        cap = cv2.VideoCapture(str(output_path))
        if not cap.isOpened():
            return None

        frame = None
        try:
            ok, candidate = cap.read()
            if ok and candidate is not None:
                frame = candidate
        finally:
            cap.release()

        if frame is None:
            return None

        if not cv2.imwrite(str(preview_path), frame):
            return None
        return preview_path

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
        if crop.size == 0:
            return {"label": BUSY_LABEL, "confidence": 0.0, "class_mapping": {}}

        result = self.model.predict(crop, imgsz=self.classify_imgsz, verbose=False)[0]
        probs = getattr(result, "probs", None)
        names = self._normalize_names(result.names)
        if probs is None:
            return {"label": BUSY_LABEL, "confidence": 0.0, "class_mapping": names}

        cls_id = int(probs.top1)
        label = names.get(str(cls_id), BUSY_LABEL).lower()
        if label not in {FREE_LABEL, BUSY_LABEL}:
            label = BUSY_LABEL

        return {
            "label": label,
            "confidence": float(probs.top1conf),
            "class_mapping": names,
        }

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
        cv2.rectangle(frame, (x, y), (x + w, y + h), color, 3)
        cv2.rectangle(frame, (x, max(0, y - 28)), (x + 190, y), color, -1)
        cv2.putText(
            frame,
            f"P{slot_index} {label} {confidence:.2f}",
            (x + 8, max(18, y - 8)),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.55,
            (255, 255, 255),
            2,
            cv2.LINE_AA,
        )

    @staticmethod
    def _draw_header(frame: Any, free: int, occupied: int, total: int, title: str) -> None:
        overlay = frame.copy()
        cv2.rectangle(overlay, (20, 20), (470, 110), (18, 24, 38), -1)
        cv2.addWeighted(overlay, 0.75, frame, 0.25, 0, frame)
        cv2.putText(frame, f"Free: {free}", (36, 58), cv2.FONT_HERSHEY_SIMPLEX, 0.9, (46, 204, 113), 2, cv2.LINE_AA)
        cv2.putText(frame, f"Occupied: {occupied}", (160, 58), cv2.FONT_HERSHEY_SIMPLEX, 0.9, (255, 193, 7), 2, cv2.LINE_AA)
        cv2.putText(frame, f"Total: {total}", (336, 58), cv2.FONT_HERSHEY_SIMPLEX, 0.9, (255, 255, 255), 2, cv2.LINE_AA)
        cv2.putText(
            frame,
            title,
            (36, 92),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.6,
            (214, 224, 240),
            1,
            cv2.LINE_AA,
        )

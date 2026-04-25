from __future__ import annotations

import json
import os
import threading
import time
from concurrent.futures import Future, ThreadPoolExecutor
from dataclasses import asdict, dataclass
from datetime import datetime, timedelta, timezone
import ipaddress
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import cv2
from flask import current_app

from .. import db
from ..models.place import Place, StatutPlace
from ..models.parking_ai_source import ParkingAISource, TypeSourceIA
from .object_storage import ObjectStorageService
from .slot_mapping_service import assign_slots_to_places
from .video_ai_service import (
    BUSY_LABEL,
    FREE_LABEL,
    ParkingVideoAIService,
    _normalize_parking_label,
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
    _camera_scheduler_started = False
    _camera_scheduler_lock = threading.Lock()
    _camera_processing_ids: set[int] = set()

    def __init__(self, upload_root: str) -> None:
        self.flask_app = current_app._get_current_object()
        self.backend_root = Path(__file__).resolve().parents[2]
        self.upload_root = Path(upload_root)
        self.analysis_root = self.upload_root / "ai_source_analysis"
        self.output_root = self.analysis_root / "output"
        self.calibration_root = self.analysis_root / "calibration_frames"
        self.source_cache_root = self.analysis_root / "source_cache"
        self.history_path = self.analysis_root / "history.json"
        self.object_storage = ObjectStorageService()

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
        # Match the standalone ai-module defaults so backend and local runs
        # produce the same crops and classification behavior unless explicitly overridden.
        self.classify_imgsz = max(96, int(os.getenv("SMART_PARKING_CLASSIFY_IMGSZ", "160")))
        self.slot_padding_ratio = max(0.0, float(os.getenv("SMART_PARKING_SLOT_PADDING_RATIO", "0.0")))
        self.debug_enabled = os.getenv("SMART_PARKING_AI_DEBUG", "").strip().lower() in {"1", "true", "yes", "on"}
        self._ensure_storage()

    @classmethod
    def start_camera_scheduler(cls, app: Any, upload_root: str) -> None:
        if os.getenv("SMART_PARKING_DISABLE_CAMERA_SCHEDULER", "").strip().lower() in {"1", "true", "yes", "on"}:
            return

        with cls._camera_scheduler_lock:
            if cls._camera_scheduler_started:
                return
            cls._camera_scheduler_started = True

        worker = threading.Thread(
            target=cls._camera_scheduler_loop,
            args=(app, upload_root),
            name="smart-parking-camera-scheduler",
            daemon=True,
        )
        worker.start()

    @classmethod
    def _camera_scheduler_loop(cls, app: Any, upload_root: str) -> None:
        sleep_seconds = max(5, int(os.getenv("SMART_PARKING_CAMERA_SCHEDULER_SLEEP", "10")))
        while True:
            try:
                with app.app_context():
                    service = cls(upload_root)
                    service.process_due_camera_sources()
            except Exception as exc:
                app.logger.warning("Camera scheduler iteration failed: %s", exc)
            time.sleep(sleep_seconds)

    def analyze_source(self, source: ParkingAISource) -> dict[str, Any]:
        source_type = source.source_type.value if isinstance(source.source_type, TypeSourceIA) else str(source.source_type)
        source_id = source.id_source
        parking_id = source.parking_id
        if source_type == TypeSourceIA.camera.value:
            db.session.expunge(source)
            db.session.remove()
            result = self._analyze_camera(source)
            self._upsert_history_entry(result.to_dict())
            self._persist_camera_processing_state(source_id, result=result.to_dict())
            return self._attach_output_url(result.to_dict())

        file_path = self.resolve_source_path(source)

        if not file_path or not file_path.exists():
            return self.record_error(
                source_id=source_id,
                parking_id=parking_id,
                source_type=source_type,
                error="Le fichier source est introuvable.",
            )

        # Release any request-bound DB connection before long-running inference.
        db.session.expunge(source)
        db.session.remove()

        if source_type == TypeSourceIA.image.value:
            result = self._analyze_image(source, file_path)
        elif source_type == TypeSourceIA.video.value:
            result = self._analyze_video(source, file_path)
        else:
            result = self.record_error(
                source_id=source_id,
                parking_id=parking_id,
                source_type=source_type,
                error="Type de source IA non pris en charge.",
            )
            return result

        self._upsert_history_entry(result.to_dict())
        return self._attach_output_url(result.to_dict())

    def process_due_camera_sources(self) -> None:
        now = datetime.now(timezone.utc)
        sources = (
            ParkingAISource.query.filter_by(source_type=TypeSourceIA.camera, auto_processing_enabled=True)
            .order_by(ParkingAISource.id_source.asc())
            .all()
        )

        for source in sources:
            if not self.can_process_camera_in_cloud(source):
                continue

            interval_seconds = max(10, int(getattr(source, "auto_process_interval_seconds", 30) or 30))
            last_processed_at = getattr(source, "last_processed_at", None)
            if last_processed_at is not None:
                if last_processed_at.tzinfo is None:
                    last_processed_at = last_processed_at.replace(tzinfo=timezone.utc)
                if now - last_processed_at < timedelta(seconds=interval_seconds):
                    continue

            source_id = int(source.id_source)
            with self._camera_scheduler_lock:
                if source_id in self._camera_processing_ids:
                    continue
                self._camera_processing_ids.add(source_id)

            try:
                result = self.analyze_source(source)
                self._persist_camera_processing_state(source_id, result=result)
            except Exception as exc:
                self.record_error(source_id, source.parking_id, TypeSourceIA.camera.value, str(exc))
                self._persist_camera_processing_state(source_id, error=str(exc))
            finally:
                with self._camera_scheduler_lock:
                    self._camera_processing_ids.discard(source_id)

    def can_process_camera_in_cloud(self, source: ParkingAISource) -> bool:
        stream_url = (source.stream_url or "").strip()
        if not stream_url:
            return False

        mode, _ = self.get_camera_processing_mode(stream_url)
        return mode == "cloud"

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
                # Release the worker's DB connection before long-running video inference.
                db.session.expunge(source)
                db.session.remove()
                resolved_path = self.resolve_source_path(source)
                if not resolved_path:
                    raise RuntimeError("Le fichier source est introuvable.")
                result = self._analyze_video(source, resolved_path)
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
            path = self.resolve_source_path(source)
            if not path or not path.exists():
                return None, None
            return path, source.mime_type or "image/jpeg"

        if source_type != TypeSourceIA.video.value:
            return None, None

        file_path = self.resolve_source_path(source)
        if not file_path or not file_path.exists():
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

    def _persist_camera_processing_state(
        self,
        source_id: int,
        result: dict[str, Any] | None = None,
        error: str | None = None,
    ) -> None:
        source = ParkingAISource.query.get(source_id)
        if not source or source.source_type != TypeSourceIA.camera:
            return

        source.last_processed_at = datetime.now(timezone.utc)
        if error:
            lowered = error.lower()
            source.camera_status = "offline" if "ouvrir ce flux" in lowered or "lire une image exploitable" in lowered else "error"
            source.last_error = error
        else:
            source.camera_status = "active"
            source.last_error = None
        db.session.commit()

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
        self._log_debug(
            "image-process-start parking_id=%s source_id=%s file=%s model=%s slots=%s imgsz=%s padding=%s total_slots=%s",
            source.parking_id,
            source.id_source,
            file_path,
            self.model_path,
            self.video_service.get_slots_path(source.parking_id),
            self.classify_imgsz,
            self.slot_padding_ratio,
            len(self.video_service.get_slots(source.parking_id)[0]),
        )
        frame = cv2.imread(str(file_path))
        if frame is None:
            raise RuntimeError("Impossible de lire cette image.")
        return self._analyze_frame(
            source=source,
            frame=frame,
            source_type=TypeSourceIA.image.value,
            title="Smart Parking Image Analysis",
            output_filename=f"source_{source.id_source}_annotated.jpg",
        )

    def _analyze_camera(self, source: ParkingAISource) -> ParkingSourceAnalysisResult:
        frame, resolution = self._capture_camera_frame(source)
        return self._analyze_frame(
            source=source,
            frame=frame,
            source_type=TypeSourceIA.camera.value,
            title="Smart Parking Camera Analysis",
            resolution=resolution,
            output_filename=f"source_{source.id_source}_camera_annotated.jpg",
        )

    def analyze_camera_frame_file(self, source: ParkingAISource, frame_path: Path) -> dict[str, Any]:
        frame = cv2.imread(str(frame_path))
        if frame is None:
            raise RuntimeError("Impossible de lire l image envoyee par le worker local.")

        height, width = frame.shape[:2]
        result = self._analyze_frame(
            source=source,
            frame=frame,
            source_type=TypeSourceIA.camera.value,
            title="Smart Parking Edge Camera Analysis",
            resolution=f"{width}x{height}",
            output_filename=f"source_{source.id_source}_camera_annotated.jpg",
        )
        self._upsert_history_entry(result.to_dict())
        self._persist_camera_processing_state(source.id_source, result=result.to_dict())
        return self._attach_output_url(result.to_dict())

    def _capture_camera_frame(self, source: ParkingAISource) -> tuple[Any, str]:
        stream_url = (source.stream_url or "").strip()
        if not stream_url:
            raise RuntimeError("Aucun flux camera n est configure pour cette source.")

        self._validate_camera_stream_url(stream_url)

        cap = cv2.VideoCapture(stream_url)
        if not cap.isOpened():
            raise RuntimeError("Impossible d ouvrir ce flux camera.")

        frame = None
        try:
            for _ in range(12):
                ok, candidate = cap.read()
                if ok and candidate is not None:
                    frame = candidate
        finally:
            cap.release()

        if frame is None:
            raise RuntimeError("Impossible de lire une image exploitable depuis ce flux camera.")

        height, width = frame.shape[:2]
        return frame, f"{width}x{height}"

    @classmethod
    def get_camera_processing_mode(cls, stream_url: str) -> tuple[str, str | None]:
        try:
            cls._validate_camera_stream_url(stream_url)
        except RuntimeError as exc:
            return "edge_required", str(exc)
        return "cloud", None

    @staticmethod
    def _validate_camera_stream_url(stream_url: str) -> None:
        try:
            parsed = urlparse(stream_url)
        except Exception:
            return

        hostname = (parsed.hostname or "").strip().lower()
        if not hostname:
            return

        if hostname in {"localhost", "host.docker.internal"}:
            raise RuntimeError(
                "Ce flux camera utilise une adresse locale non accessible depuis le serveur Railway. Utilisez une URL publique ou un proxy accessible depuis internet."
            )

        try:
            ip = ipaddress.ip_address(hostname)
        except ValueError:
            return

        if ip.is_private or ip.is_loopback or ip.is_link_local:
            raise RuntimeError(
                "Ce flux camera pointe vers une IP privee non accessible depuis Railway. Deployee en cloud, l API ne peut pas joindre 192.168.x.x/10.x.x.x/172.16-31.x.x. Utilisez une URL publique, un tunnel, un VPN ou un worker local proche de la camera."
            )

    def _analyze_frame(
        self,
        source: ParkingAISource,
        frame: Any,
        source_type: str,
        title: str,
        resolution: str | None = None,
        output_filename: str | None = None,
    ) -> ParkingSourceAnalysisResult:
        slots, slots_path = self.video_service.get_slots(source.parking_id)
        slot_mapping = self._ensure_slot_mapping(source.parking_id, slots)
        slots = slot_mapping["slots"]
        if slot_mapping["changed"]:
            slots_path = self.video_service.get_slots_config_path(source.parking_id)
        if not slots:
            raise RuntimeError("Aucun slot n est configure pour ce parking. Ouvrez d abord la calibration et dessinez les places.")

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

        self._draw_header(frame, free_count, occupied_count, len(slots), title)
        parking_output_dir = self.output_root / str(source.parking_id)
        parking_output_dir.mkdir(parents=True, exist_ok=True)
        final_output_filename = output_filename or f"source_{source.id_source}_annotated.jpg"
        output_path = parking_output_dir / final_output_filename

        if not cv2.imwrite(str(output_path), frame):
            raise RuntimeError("Impossible d'ecrire l'image annotee.")

        sync_result = self._sync_places_with_slots(source.parking_id, slots, slot_states)
        sync_warning = self._merge_warnings(slot_mapping.get("warning"), sync_result["warning"])
        slot_debug = [
            {
                "slot_index": index,
                "place_id": slot.get("place_id"),
                "place_number": slot.get("place_number"),
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
            source_type=source_type,
            status="done",
            processed_at=datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds"),
            free=free_count,
            occupied=occupied_count,
            total=len(slots),
            processed_frames=1 if source_type == TypeSourceIA.camera.value else None,
            resolution=resolution or f"{width}x{height}",
            class_mapping=class_mapping,
            slot_debug=slot_debug,
            model_path=str(self.model_path),
            slots_path=str(slots_path),
            sync_mode=sync_result["mode"],
            synced_places=sync_result["synced_places"],
            sync_warning=sync_warning,
            output_path=str(output_path),
            output_filename=final_output_filename,
            output_mimetype="image/jpeg",
        )

    def _analyze_video(self, source: ParkingAISource, file_path: Path) -> ParkingSourceAnalysisResult:
        slots, _ = self.video_service.get_slots(source.parking_id)
        slot_mapping = self._ensure_slot_mapping(source.parking_id, slots)
        if not slot_mapping["slots"]:
            raise RuntimeError("Aucun slot n est configure pour ce parking. Ouvrez d abord la calibration et dessinez les places.")
        video_result = self.video_service.process_video(
            parking_id=source.parking_id,
            input_path=file_path,
            source_filename=source.original_name or file_path.name,
        )
        output_path = self.video_service.resolve_output_path(source.parking_id, video_result.id)
        preview_path = self._extract_video_output_preview(source.parking_id, source.id_source, output_path)
        slots, _ = self.video_service.get_slots(source.parking_id)
        sync_result = self._sync_places_with_slots(source.parking_id, slots, video_result.slot_states)
        sync_warning = self._merge_warnings(slot_mapping.get("warning"), sync_result["warning"])

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
            sync_warning=sync_warning,
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

    def _ensure_slot_mapping(self, parking_id: int, slots: list[dict[str, Any]]) -> dict[str, Any]:
        mapping = assign_slots_to_places(parking_id, slots)
        if mapping["changed"]:
            self.video_service.save_parking_slots(parking_id, mapping["slots"])
        return mapping

    @staticmethod
    def _merge_warnings(*warnings: str | None) -> str | None:
        parts = [warning.strip() for warning in warnings if warning and warning.strip()]
        if not parts:
            return None
        return " ".join(dict.fromkeys(parts))

    def _ensure_storage(self) -> None:
        for directory in (self.analysis_root, self.output_root, self.calibration_root, self.source_cache_root):
            directory.mkdir(parents=True, exist_ok=True)
        if not self.history_path.exists():
            self.history_path.write_text("[]", encoding="utf-8")

    def resolve_source_path(self, source: ParkingAISource) -> Path | None:
        raw_file_path = (source.file_path or "").strip()
        local_path = Path(raw_file_path) if raw_file_path else None
        if local_path and local_path.exists():
            return local_path

        bucket_key = getattr(source, "bucket_key", None)
        if not bucket_key or not self.object_storage.enabled:
            return None

        safe_name = Path(source.original_name or f"source_{source.id_source}").name
        destination = self.source_cache_root / str(source.parking_id) / f"{source.id_source}_{safe_name}"
        try:
            return self.object_storage.download_file(bucket_key, destination)
        except Exception:
            return None

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
    def _draw_header(frame: Any, free: int, occupied: int, total: int, title: str) -> None:
        x1, y1, x2, y2 = 20, 20, 470, 110
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
            title,
            (36, 92),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.6,
            (214, 224, 240),
            1,
            cv2.LINE_AA,
        )

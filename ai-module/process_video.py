from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any

import cv2
from ultralytics import YOLO


FREE_LABEL = "free"
BUSY_LABEL = "busy"


@dataclass
class ProcessedVideoResult:
    input_filename: str
    output_filename: str
    output_path: str
    free: int
    occupied: int
    total: int
    processed_frames: int
    fps: float
    resolution: str
    class_mapping: dict[str, str]

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def resolve_existing_path(candidates: list[Path], label: str) -> Path:
    for path in candidates:
        if path.exists() and path.is_file() and path.stat().st_size > 0:
            return path
    checked = "\n".join(str(path) for path in candidates)
    raise FileNotFoundError(f"No valid {label} file found. Checked:\n{checked}")


def load_slots(slots_path: Path) -> list[dict[str, int | None]]:
    with slots_path.open("r", encoding="utf-8") as handle:
        slots = json.load(handle)

    if not isinstance(slots, list) or not slots:
        raise ValueError(
            "slots.json must contain a non-empty list of slot rectangles, for example "
            '[{"place_id": 12, "x": 120, "y": 80, "w": 90, "h": 160}].'
        )

    normalized_slots: list[dict[str, int | None]] = []
    for index, slot in enumerate(slots, start=1):
        if not isinstance(slot, dict):
            raise ValueError(f"Slot #{index} must be an object.")

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

    return normalized_slots


@lru_cache(maxsize=2)
def load_model(model_path: str) -> YOLO:
    return YOLO(model_path)


def is_parking_classifier(model_path: Path) -> bool:
    try:
        names = load_model(str(model_path)).names
    except Exception:
        return False

    normalized = {str(value).lower() for value in getattr(names, "values", lambda: [])()}
    return FREE_LABEL in normalized and BUSY_LABEL in normalized


class ParkingVideoProcessor:
    def __init__(self, model_path: Path, slots_path: Path, image_size: int = 160) -> None:
        self.model_path = model_path
        self.slots_path = slots_path
        self.image_size = image_size
        self.slots = load_slots(slots_path)
        self.model = load_model(str(model_path))

    def process(self, input_path: Path, output_path: Path) -> ProcessedVideoResult:
        cap = cv2.VideoCapture(str(input_path))
        if not cap.isOpened():
            raise RuntimeError(f"Unable to open video: {input_path}")

        fps = float(cap.get(cv2.CAP_PROP_FPS) or 25.0)
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 0)
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0)
        if width <= 0 or height <= 0:
            cap.release()
            raise RuntimeError("The uploaded video has an invalid resolution.")

        output_path.parent.mkdir(parents=True, exist_ok=True)
        writer = cv2.VideoWriter(
            str(output_path),
            cv2.VideoWriter_fourcc(*"mp4v"),
            fps,
            (width, height),
        )
        if not writer.isOpened():
            cap.release()
            raise RuntimeError(f"Unable to create output video: {output_path}")

        class_mapping: dict[str, str] = {}
        slot_votes = [{"free": 0, "busy": 0} for _ in self.slots]
        processed_frames = 0

        try:
            while True:
                ok, frame = cap.read()
                if not ok:
                    break

                free_count = 0
                occupied_count = 0

                for slot_index, slot in enumerate(self.slots, start=1):
                    prediction = self._predict_slot(frame, slot)
                    class_mapping.update(prediction["class_mapping"])

                    is_free = prediction["label"] == FREE_LABEL
                    vote_key = FREE_LABEL if is_free else BUSY_LABEL
                    slot_votes[slot_index - 1][vote_key] += 1

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

                self._draw_header(frame, free_count, occupied_count, len(self.slots))
                writer.write(frame)
                processed_frames += 1
        finally:
            cap.release()
            writer.release()

        if processed_frames == 0:
            output_path.unlink(missing_ok=True)
            raise RuntimeError("The uploaded video does not contain readable frames.")

        final_states = [
            FREE_LABEL if votes[FREE_LABEL] >= votes[BUSY_LABEL] else BUSY_LABEL
            for votes in slot_votes
        ]
        free = sum(state == FREE_LABEL for state in final_states)
        total = len(final_states)

        return ProcessedVideoResult(
            input_filename=input_path.name,
            output_filename=output_path.name,
            output_path=str(output_path),
            free=free,
            occupied=total - free,
            total=total,
            processed_frames=processed_frames,
            fps=round(fps, 2),
            resolution=f"{width}x{height}",
            class_mapping=class_mapping,
        )

    def _predict_slot(self, frame: Any, slot: dict[str, int]) -> dict[str, Any]:
        x, y, w, h = slot["x"], slot["y"], slot["w"], slot["h"]
        crop = frame[y : y + h, x : x + w]

        if crop.size == 0:
            return {
                "label": BUSY_LABEL,
                "confidence": 0.0,
                "class_mapping": {},
            }

        result = self.model.predict(crop, imgsz=self.image_size, verbose=False)[0]
        probs = getattr(result, "probs", None)
        if probs is None:
            return {
                "label": BUSY_LABEL,
                "confidence": 0.0,
                "class_mapping": self._normalize_names(result.names),
            }

        names = self._normalize_names(result.names)
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
        text = f"P{slot_index} {label} {confidence:.2f}"

        cv2.rectangle(frame, (x, y), (x + w, y + h), color, 3)
        cv2.rectangle(frame, (x, max(0, y - 28)), (x + 190, y), color, -1)
        cv2.putText(
            frame,
            text,
            (x + 8, max(18, y - 8)),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.55,
            (255, 255, 255),
            2,
            cv2.LINE_AA,
        )

    @staticmethod
    def _draw_header(frame: Any, free: int, occupied: int, total: int) -> None:
        overlay = frame.copy()
        cv2.rectangle(overlay, (20, 20), (450, 110), (18, 24, 38), -1)
        cv2.addWeighted(overlay, 0.75, frame, 0.25, 0, frame)
        cv2.putText(
            frame,
            f"Free: {free}",
            (36, 58),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.9,
            (46, 204, 113),
            2,
            cv2.LINE_AA,
        )
        cv2.putText(
            frame,
            f"Occupied: {occupied}",
            (160, 58),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.9,
            (255, 193, 7),
            2,
            cv2.LINE_AA,
        )
        cv2.putText(
            frame,
            f"Total: {total}",
            (336, 58),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.9,
            (255, 255, 255),
            2,
            cv2.LINE_AA,
        )
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

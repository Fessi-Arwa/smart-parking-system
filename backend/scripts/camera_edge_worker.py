import json
import os
import sys
import time
import uuid
from pathlib import Path
from typing import Iterable
from urllib import error, parse, request

import cv2


API_BASE_URL = os.getenv("SMART_PARKING_API_BASE_URL", "").rstrip("/")
OWNER_TOKEN = os.getenv("SMART_PARKING_OWNER_TOKEN", "").strip()
PARKING_IDS = [
    int(value.strip())
    for value in (os.getenv("SMART_PARKING_CAMERA_PARKING_IDS", "") or "").split(",")
    if value.strip()
]
SOURCE_IDS = {
    int(value.strip())
    for value in (os.getenv("SMART_PARKING_CAMERA_SOURCE_IDS", "") or "").split(",")
    if value.strip()
}
LOOP_SECONDS = max(10, int(os.getenv("SMART_PARKING_CAMERA_LOOP_SECONDS", "30")))
RUN_ONCE = os.getenv("SMART_PARKING_CAMERA_ONCE", "").strip().lower() in {"1", "true", "yes", "on"}


def build_headers(content_type: str | None = None) -> dict[str, str]:
    headers = {
        "Authorization": f"Bearer {OWNER_TOKEN}",
    }
    if content_type:
        headers["Content-Type"] = content_type
    return headers


def http_get_json(url: str) -> object:
    req = request.Request(url, headers=build_headers())
    with request.urlopen(req, timeout=30) as response:
        return json.loads(response.read().decode("utf-8"))


def http_post_multipart(url: str, field_name: str, filename: str, content: bytes, mime_type: str) -> object:
    boundary = f"----SmartParking{uuid.uuid4().hex}"
    body = b"".join(
        [
            f"--{boundary}\r\n".encode("utf-8"),
            f'Content-Disposition: form-data; name="{field_name}"; filename="{filename}"\r\n'.encode("utf-8"),
            f"Content-Type: {mime_type}\r\n\r\n".encode("utf-8"),
            content,
            b"\r\n",
            f"--{boundary}--\r\n".encode("utf-8"),
        ]
    )
    req = request.Request(
        url,
        data=body,
        headers=build_headers(f"multipart/form-data; boundary={boundary}"),
        method="POST",
    )
    with request.urlopen(req, timeout=60) as response:
        return json.loads(response.read().decode("utf-8"))


def get_camera_sources(parking_id: int) -> list[dict]:
    payload = http_get_json(f"{API_BASE_URL}/owner/parkings/{parking_id}/ai-sources")
    if not isinstance(payload, list):
        return []

    filtered = []
    for source in payload:
        if not isinstance(source, dict):
            continue
        if source.get("source_type") != "camera":
            continue
        if SOURCE_IDS and int(source.get("id_source", 0)) not in SOURCE_IDS:
            continue
        if not SOURCE_IDS and not source.get("auto_processing_enabled"):
            continue
        filtered.append(source)
    return filtered


def capture_frame(stream_url: str) -> bytes:
    cap = cv2.VideoCapture(stream_url)
    if not cap.isOpened():
        raise RuntimeError(f"Impossible d ouvrir le flux local {stream_url}")

    frame = None
    try:
        for _ in range(12):
            ok, candidate = cap.read()
            if ok and candidate is not None:
                frame = candidate
    finally:
        cap.release()

    if frame is None:
        raise RuntimeError(f"Impossible de lire une image exploitable depuis {stream_url}")

    ok, encoded = cv2.imencode(".jpg", frame)
    if not ok:
        raise RuntimeError("Impossible d encoder la capture camera en JPEG")
    return encoded.tobytes()


def process_source(source: dict) -> None:
    source_id = int(source["id_source"])
    label = source.get("label") or f"camera-{source_id}"
    stream_url = (source.get("stream_url") or "").strip()
    if not stream_url:
        print(f"[skip] source {source_id}: stream_url manquant")
        return

    try:
        image_bytes = capture_frame(stream_url)
        response = http_post_multipart(
            f"{API_BASE_URL}/owner/ai-sources/{source_id}/camera-frame-upload",
            field_name="file",
            filename=f"{label.replace(' ', '_')}.jpg",
            content=image_bytes,
            mime_type="image/jpeg",
        )
        analysis = response.get("analysis") if isinstance(response, dict) else None
        summary = ""
        if isinstance(analysis, dict) and analysis.get("status") == "done":
            summary = (
                f" -> free={analysis.get('free')} occupied={analysis.get('occupied')} "
                f"total={analysis.get('total')}"
            )
        print(f"[ok] source {source_id} {label}{summary}")
    except error.HTTPError as exc:
        payload = exc.read().decode("utf-8", errors="replace")
        print(f"[http-error] source {source_id} {label}: {exc.code} {payload}")
    except Exception as exc:
        print(f"[error] source {source_id} {label}: {exc}")


def iter_sources() -> Iterable[dict]:
    for parking_id in PARKING_IDS:
        try:
            yield from get_camera_sources(parking_id)
        except error.HTTPError as exc:
            payload = exc.read().decode("utf-8", errors="replace")
            print(f"[http-error] parking {parking_id}: {exc.code} {payload}")
        except Exception as exc:
            print(f"[error] parking {parking_id}: {exc}")


def validate_env() -> None:
    missing = []
    if not API_BASE_URL:
        missing.append("SMART_PARKING_API_BASE_URL")
    if not OWNER_TOKEN:
        missing.append("SMART_PARKING_OWNER_TOKEN")
    if not PARKING_IDS:
        missing.append("SMART_PARKING_CAMERA_PARKING_IDS")
    if missing:
        raise RuntimeError(f"Variables manquantes: {', '.join(missing)}")


def main() -> int:
    try:
        validate_env()
    except Exception as exc:
        print(exc)
        return 1

    print("Smart Parking camera edge worker started")
    print(f"API={API_BASE_URL} parkings={PARKING_IDS} loop={LOOP_SECONDS}s once={RUN_ONCE}")

    while True:
        sources = list(iter_sources())
        if not sources:
            print("[info] aucune camera auto-active trouvee pour ce cycle")
        for source in sources:
            process_source(source)

        if RUN_ONCE:
            return 0
        time.sleep(LOOP_SECONDS)


if __name__ == "__main__":
    raise SystemExit(main())

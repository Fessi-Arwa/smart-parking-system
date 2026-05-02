from __future__ import annotations

import base64
import json
from dataclasses import asdict, dataclass
from typing import Any
from urllib import error, request

import cv2
import numpy as np


def normalize_plate(value: str | None) -> str | None:
    if value is None:
        return None

    normalized = "".join(character for character in value.upper() if character.isalnum())
    return normalized or None


@dataclass
class PlateRecognitionResponse:
    status: str
    plate_text: str | None = None
    normalized_plate: str | None = None
    confidence: float | None = None
    bbox: dict[str, Any] | None = None
    raw_text: str | None = None
    annotated_image_base64: str | None = None
    service_response: dict[str, Any] | None = None
    error: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


class PlateRecognitionService:
    def __init__(self, *, api_url: str | None, timeout: int = 15, api_token: str | None = None) -> None:
        self.api_url = (api_url or "").strip()
        self.timeout = max(3, int(timeout))
        self.api_token = (api_token or "").strip()

    @property
    def is_configured(self) -> bool:
        return bool(self.api_url)

    def recognize(
        self,
        image: Any,
        *,
        parking_id: int | None = None,
        place_id: int | None = None,
        source_id: int | None = None,
        captured_at: str | None = None,
    ) -> PlateRecognitionResponse:
        if not self.is_configured:
            return PlateRecognitionResponse(status="disabled", error="Plate recognition API is not configured.")

        prepared_image = self._prepare_image_for_ocr(image)
        ok, buffer = cv2.imencode(".png", prepared_image)
        if not ok:
            return PlateRecognitionResponse(status="error", error="Unable to encode the vehicle crop.")

        payload = {
            "image_base64": base64.b64encode(buffer.tobytes()).decode("utf-8"),
            "parking_id": parking_id,
            "place_id": place_id,
            "source_id": source_id,
            "captured_at": captured_at,
        }

        raw_response = self._post_json(payload)
        if raw_response.get("status") != "ok":
            return PlateRecognitionResponse(
                status=str(raw_response.get("status") or "error"),
                error=str(raw_response.get("error") or "Plate recognition service returned an invalid response."),
                service_response=raw_response,
            )

        plate_text = raw_response.get("plate_text") or raw_response.get("raw_text")
        normalized_plate = normalize_plate(raw_response.get("normalized_plate") or plate_text)
        confidence_value = raw_response.get("confidence")
        try:
            confidence = float(confidence_value) if confidence_value is not None else None
        except (TypeError, ValueError):
            confidence = None

        return PlateRecognitionResponse(
            status="ok",
            plate_text=plate_text,
            normalized_plate=normalized_plate,
            confidence=confidence,
            bbox=raw_response.get("bbox") if isinstance(raw_response.get("bbox"), dict) else None,
            raw_text=raw_response.get("raw_text"),
            annotated_image_base64=raw_response.get("annotated_image_base64"),
            service_response=raw_response,
        )

    def _prepare_image_for_ocr(self, image: Any) -> Any:
        if image is None or getattr(image, "size", 0) == 0:
            return image

        prepared = image.copy()
        height, width = prepared.shape[:2]

        min_width = 960
        min_height = 540
        upscale_ratio = max(min_width / max(1, width), min_height / max(1, height), 1.0)
        if upscale_ratio > 1.0:
            prepared = cv2.resize(
                prepared,
                None,
                fx=upscale_ratio,
                fy=upscale_ratio,
                interpolation=cv2.INTER_CUBIC,
            )

        lab = cv2.cvtColor(prepared, cv2.COLOR_BGR2LAB)
        l_channel, a_channel, b_channel = cv2.split(lab)
        l_channel = cv2.createCLAHE(clipLimit=2.2, tileGridSize=(8, 8)).apply(l_channel)
        prepared = cv2.cvtColor(cv2.merge((l_channel, a_channel, b_channel)), cv2.COLOR_LAB2BGR)

        denoised = cv2.bilateralFilter(prepared, 7, 40, 40)
        sharpened = cv2.addWeighted(denoised, 1.3, cv2.GaussianBlur(denoised, (0, 0), 1.2), -0.3, 0)
        return np.ascontiguousarray(sharpened)

    def _post_json(self, payload: dict[str, Any]) -> dict[str, Any]:
        body = json.dumps(payload).encode("utf-8")
        http_request = request.Request(self.api_url, data=body, method="POST")
        http_request.add_header("Content-Type", "application/json")
        http_request.add_header("Accept", "application/json")
        if self.api_token:
            http_request.add_header("Authorization", f"Bearer {self.api_token}")

        try:
            with request.urlopen(http_request, timeout=self.timeout) as response:
                response_body = response.read().decode("utf-8")
        except error.HTTPError as exc:
            response_body = exc.read().decode("utf-8", errors="replace")
            parsed_body = self._parse_json_body(response_body)
            service_error = None
            if isinstance(parsed_body, dict):
                service_error = parsed_body.get("error") or parsed_body.get("message") or parsed_body.get("detail")
            return {
                "status": "error",
                "error": (
                    f"Plate recognition service returned HTTP {exc.code}: {service_error}"
                    if service_error
                    else f"Plate recognition service returned HTTP {exc.code}."
                ),
                "http_status": exc.code,
                "service_error": service_error,
                "response_json": parsed_body,
                "response_body": response_body[:500],
            }
        except error.URLError as exc:
            return {
                "status": "error",
                "error": f"Unable to reach the plate recognition service: {exc.reason}",
            }
        except Exception as exc:
            return {
                "status": "error",
                "error": f"Unexpected plate recognition error: {exc}",
            }

        try:
            parsed = json.loads(response_body or "{}")
        except json.JSONDecodeError:
            return {
                "status": "error",
                "error": "Plate recognition service did not return valid JSON.",
                "response_body": response_body[:500],
            }

        return parsed if isinstance(parsed, dict) else {"status": "error", "error": "Invalid JSON payload."}

    @staticmethod
    def _parse_json_body(response_body: str) -> dict[str, Any] | None:
        try:
            parsed = json.loads(response_body or "{}")
        except json.JSONDecodeError:
            return None
        return parsed if isinstance(parsed, dict) else None

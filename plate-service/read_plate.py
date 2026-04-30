import argparse
import base64
import os
import re
import sys
import ctypes
from functools import lru_cache
from pathlib import Path

import cv2
import numpy as np


DEFAULT_MODEL = Path("best.pt")
DEFAULT_OCR_DIR = Path(".easyocr")
DEFAULT_PADDLE_CACHE_DIR = Path(".paddlex")
ARABIC_TUNIS = "\u062a\u0648\u0646\u0633"
DEFAULT_DETECTION_PADDING = 0.12


def preprocess_plate_variants(image):
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    enlarged = cv2.resize(gray, None, fx=3.0, fy=3.0, interpolation=cv2.INTER_CUBIC)
    denoised = cv2.bilateralFilter(enlarged, 9, 35, 35)
    clahe = cv2.createCLAHE(clipLimit=2.5, tileGridSize=(8, 8)).apply(denoised)
    sharpened = cv2.addWeighted(clahe, 1.5, cv2.GaussianBlur(clahe, (0, 0), 2), -0.5, 0)

    variants = {
        "gray": sharpened,
        "binary_otsu": cv2.threshold(sharpened, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)[1],
        "binary_inv_otsu": cv2.threshold(sharpened, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)[1],
        "adaptive_mean": cv2.adaptiveThreshold(
            sharpened, 255, cv2.ADAPTIVE_THRESH_MEAN_C, cv2.THRESH_BINARY, 31, 9
        ),
        "adaptive_gaussian": cv2.adaptiveThreshold(
            sharpened, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 31, 11
        ),
    }
    return variants


def load_image(image_path: Path):
    data = np.fromfile(str(image_path), dtype=np.uint8)
    if data.size == 0:
        return None
    return cv2.imdecode(data, cv2.IMREAD_COLOR)


def save_image(image_path: Path, image) -> bool:
    suffix = image_path.suffix or ".jpg"
    ok, encoded = cv2.imencode(suffix, image)
    if not ok:
        return False
    encoded.tofile(str(image_path))
    return True


def clean_text(text):
    text = text.upper().strip()
    text = re.sub(r"[^A-Z0-9\u0600-\u06FF]", " ", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def extract_arabic_chunk(text):
    match = re.search(r"[\u0600-\u06FF]+", text)
    return match.group(0) if match else ""


def normalize_plate(text):
    if not text:
        return None
    normalized = "".join(character for character in clean_text(text) if character.isalnum())
    return normalized or None


def get_compatible_path(path):
    if os.name != "nt":
        return str(path)

    try:
        buffer_size = 4096
        buffer = ctypes.create_unicode_buffer(buffer_size)
        result = ctypes.windll.kernel32.GetShortPathNameW(str(path), buffer, buffer_size)
        if result:
            return buffer.value
    except Exception:
        pass
    return str(path)


def canonicalize_tunisian_plate(text):
    cleaned = clean_text(text)
    if not cleaned:
        return ""

    digit_groups = re.findall(r"\d+", cleaned)
    arabic_chunk = extract_arabic_chunk(cleaned)
    if len(digit_groups) >= 2 and arabic_chunk:
        left_group = digit_groups[0]
        right_group = digit_groups[1]
        return f"{left_group} {ARABIC_TUNIS} {right_group}"
    return cleaned


def score_plate_candidate(text):
    cleaned = clean_text(text)
    if not cleaned:
        return -1

    score = 0
    digit_groups = re.findall(r"\d+", cleaned)
    score += sum(min(len(group), 4) for group in digit_groups) * 2

    if len(digit_groups) >= 2:
        score += 8
    if ARABIC_TUNIS in cleaned:
        score += 12
    if re.search(r"[\u0600-\u06FF]", cleaned):
        score += 6
    if re.search(r"\d+\s+[\u0600-\u06FF]+\s+\d+", cleaned):
        score += 10

    if len(digit_groups) >= 2:
        left_len = len(digit_groups[0])
        right_len = len(digit_groups[1])
        if 2 <= left_len <= 3:
            score += 8
        else:
            score -= abs(left_len - 3) * 6

        if 3 <= right_len <= 4:
            score += 8
        else:
            score -= abs(right_len - 4) * 6

        total_digits = left_len + right_len
        if total_digits == 7:
            score += 10
        elif total_digits in (6, 8):
            score += 4
        else:
            score -= abs(total_digits - 7) * 4

    for group in digit_groups:
        if len(group) > 4:
            score -= (len(group) - 4) * 10

    score -= max(0, len(cleaned) - 16)
    return score


def expand_bbox(x1, y1, x2, y2, image_width, image_height, padding_ratio=DEFAULT_DETECTION_PADDING):
    width = max(1, x2 - x1)
    height = max(1, y2 - y1)
    pad_x = int(width * padding_ratio)
    pad_y = int(height * padding_ratio)

    nx1 = max(0, x1 - pad_x)
    ny1 = max(0, y1 - pad_y)
    nx2 = min(image_width, x2 + pad_x)
    ny2 = min(image_height, y2 + pad_y)
    return nx1, ny1, nx2, ny2


def score_detection_candidate(bbox, confidence, image_shape):
    image_height, image_width = image_shape[:2]
    area_ratio = (bbox["w"] * bbox["h"]) / max(1, image_width * image_height)
    center_x = bbox["x"] + bbox["w"] / 2
    center_y = bbox["y"] + bbox["h"] / 2
    horizontal_bias = 1.0 - abs(center_x - image_width / 2) / max(1, image_width / 2)
    vertical_bias = center_y / max(1, image_height)
    return (confidence * 3.0) + (area_ratio * 8.0) + horizontal_bias + vertical_bias


@lru_cache(maxsize=2)
def load_detector(model_path):
    from ultralytics import YOLO

    return YOLO(str(model_path))


def detect_plates_from_image(image, model_path, conf):
    model = load_detector(Path(model_path))
    results = model.predict(source=image, conf=conf, verbose=False)
    result = results[0]

    if result.boxes is None or len(result.boxes) == 0:
        return []

    candidates = []
    image_height, image_width = image.shape[:2]
    for box in result.boxes:
        raw_x1, raw_y1, raw_x2, raw_y2 = map(int, box.xyxy[0].tolist())
        x1, y1, x2, y2 = expand_bbox(raw_x1, raw_y1, raw_x2, raw_y2, image_width, image_height)
        crop = image[y1:y2, x1:x2]
        if crop.size == 0:
            continue
        confidence = float(box.conf[0])
        bbox = {
            "x": x1,
            "y": y1,
            "w": max(0, x2 - x1),
            "h": max(0, y2 - y1),
        }
        candidates.append(
            {
                "crop": crop,
                "confidence": confidence,
                "bbox": bbox,
                "detection_score": score_detection_candidate(bbox, confidence, image.shape),
            }
        )

    candidates.sort(key=lambda item: item["detection_score"], reverse=True)
    return candidates


def detect_plate_from_image(image, model_path, conf):
    candidates = detect_plates_from_image(image, model_path, conf)
    if not candidates:
        return None, None, None
    best = candidates[0]
    return best["crop"], best["confidence"], best["bbox"]


def detect_plate(image_path, model_path, conf):
    image = load_image(Path(image_path))
    if image is None:
        raise FileNotFoundError(f"Impossible de lire l'image: {image_path}")

    return detect_plate_from_image(image, model_path, conf)


@lru_cache(maxsize=4)
def get_easyocr_reader(languages_key, storage_dir):
    try:
        import easyocr
    except ImportError:
        print("EasyOCR n'est pas installe.")
        print("Installe-le avec: python -m pip install easyocr")
        sys.exit(1)

    storage_dir = Path(storage_dir)
    storage_dir.mkdir(parents=True, exist_ok=True)
    return easyocr.Reader(
        list(languages_key),
        gpu=False,
        verbose=False,
        model_storage_directory=str(storage_dir),
        user_network_directory=str(storage_dir),
    )


def read_with_easyocr(image, languages, storage_dir, allowlist=None):
    reader = get_easyocr_reader(tuple(languages), str(storage_dir))
    candidates = []

    detailed_results = reader.readtext(image, detail=1, paragraph=False, allowlist=allowlist)
    if detailed_results:
        ordered_chunks = []
        for detection in sorted(detailed_results, key=lambda item: min(point[0] for point in item[0])):
            ordered_chunks.append(detection[1])
        text = clean_text(" ".join(ordered_chunks))
        if text:
            candidates.append(text)

    for paragraph in (False, True):
        lines = reader.readtext(image, detail=0, paragraph=paragraph, allowlist=allowlist)
        if not lines:
            continue
        text = clean_text(" ".join(lines))
        if text:
            candidates.append(text)

    if not candidates:
        return ""

    unique_candidates = []
    seen = set()
    for candidate in candidates:
        if candidate not in seen:
            seen.add(candidate)
            unique_candidates.append(candidate)

    best_candidate = max(unique_candidates, key=score_plate_candidate)
    return canonicalize_tunisian_plate(best_candidate)


@lru_cache(maxsize=2)
def get_paddleocr_reader(cache_dir):
    try:
        os.environ.setdefault("PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK", "True")
        os.environ.setdefault("PADDLE_PDX_ENABLE_MKLDNN_BYDEFAULT", "False")
        os.environ.setdefault("FLAGS_use_mkldnn", "0")

        cache_dir = Path(cache_dir)
        cache_dir.mkdir(parents=True, exist_ok=True)
        os.environ["PADDLE_PDX_CACHE_HOME"] = get_compatible_path(cache_dir.resolve())

        from paddleocr import PaddleOCR
    except Exception:
        return None

    try:
        return PaddleOCR(lang="en")
    except Exception:
        return None


def read_with_paddleocr(image, cache_dir):
    reader = get_paddleocr_reader(str(cache_dir))
    if reader is None:
        return []

    try:
        predictions = reader.predict(image)
    except Exception:
        return []

    results = []
    for item in predictions or []:
        texts = item.get("rec_texts") or []
        scores = item.get("rec_scores") or []
        for index, text in enumerate(texts):
            score = float(scores[index]) if index < len(scores) else 0.0
            cleaned = clean_text(text)
            if cleaned:
                results.append((cleaned, score))
    return results


def digits_only(text):
    groups = re.findall(r"\d+", text or "")
    return "".join(groups)


def arabic_only(text):
    groups = re.findall(r"[\u0600-\u06FF]+", text or "")
    return " ".join(groups).strip()


def compact_digits_read(crop, ocr_dir):
    best_digits = ""
    for processed in preprocess_plate_variants(crop).values():
        candidate = digits_only(read_with_easyocr(processed, ["en"], Path(ocr_dir), allowlist="0123456789"))
        if len(candidate) > len(best_digits):
            best_digits = candidate
    return best_digits


def reconstruct_tunisian_from_compact_digits(digits):
    if not digits:
        return ""
    if len(digits) >= 7:
        return f"{digits[:3]} {ARABIC_TUNIS} {digits[-4:]}"
    if len(digits) == 6:
        return f"{digits[:3]} {ARABIC_TUNIS} {digits[-3:]}"
    if len(digits) == 5:
        return f"{digits[:2]} {ARABIC_TUNIS} {digits[-3:]}"
    return ""


def build_tunisian_plate_from_groups(left_digits, right_digits):
    left_digits = digits_only(left_digits)
    right_digits = digits_only(right_digits)
    if not left_digits or not right_digits:
        return ""

    left_options = [left_digits]
    right_options = [right_digits]

    if len(left_digits) > 3:
        left_options.extend([left_digits[:3], left_digits[-3:]])
    if len(right_digits) > 4:
        right_options.extend([right_digits[:4], right_digits[-4:]])

    best_text = ""
    best_score = -10**9
    for left_value in left_options:
        for right_value in right_options:
            candidate = f"{left_value} {ARABIC_TUNIS} {right_value}"
            candidate_score = score_plate_candidate(candidate)
            if candidate_score > best_score:
                best_score = candidate_score
                best_text = candidate
    return best_text


def structured_tunisian_read_paddle(crop, paddle_cache_dir):
    height, width = crop.shape[:2]
    if width < 30 or height < 10:
        return "", -10**9

    candidate_scores = []
    left_end_ratios = (0.34, 0.38, 0.42, 0.46)
    right_start_ratios = (0.50, 0.54, 0.58)

    left_reads = {}
    right_reads = {}

    for ratio in left_end_ratios:
        left_crop = crop[:, : max(1, int(width * ratio))]
        paddle_results = read_with_paddleocr(left_crop, paddle_cache_dir)
        for text, confidence in paddle_results:
            digits = digits_only(text)
            if digits:
                left_reads[ratio] = (digits, confidence)
                break

    for ratio in right_start_ratios:
        right_crop = crop[:, max(0, int(width * ratio)) :]
        paddle_results = read_with_paddleocr(right_crop, paddle_cache_dir)
        for text, confidence in paddle_results:
            digits = digits_only(text)
            if digits:
                right_reads[ratio] = (digits, confidence)
                break

    for left_ratio, (left_digits, left_conf) in left_reads.items():
        for right_ratio, (right_digits, right_conf) in right_reads.items():
            if left_ratio >= right_ratio:
                continue
            candidate = build_tunisian_plate_from_groups(left_digits, right_digits)
            if not candidate:
                continue
            total_score = score_plate_candidate(candidate) + (left_conf + right_conf) * 8.0
            candidate_scores.append((candidate, total_score))

    whole_results = read_with_paddleocr(crop, paddle_cache_dir)
    whole_groups = [digits_only(text) for text, _score in whole_results if digits_only(text)]
    if len(whole_groups) >= 2:
        whole_candidate = build_tunisian_plate_from_groups(whole_groups[0], whole_groups[-1])
        if whole_candidate:
            avg_conf = sum(score for _text, score in whole_results) / max(1, len(whole_results))
            candidate_scores.append((whole_candidate, score_plate_candidate(whole_candidate) + avg_conf * 8.0))
    elif whole_groups:
        merged_candidate = reconstruct_tunisian_from_compact_digits("".join(whole_groups))
        if merged_candidate:
            avg_conf = sum(score for _text, score in whole_results) / max(1, len(whole_results))
            candidate_scores.append((merged_candidate, score_plate_candidate(merged_candidate) + avg_conf * 6.0))

    if not candidate_scores:
        return "", -10**9

    return max(candidate_scores, key=lambda item: item[1])


def structured_tunisian_read(crop, languages, ocr_dir):
    height, width = crop.shape[:2]
    if width < 30 or height < 10:
        return ""

    left = crop[:, : max(1, int(width * 0.34))]
    center = crop[:, max(0, int(width * 0.26)) : max(1, int(width * 0.62))]
    right = crop[:, max(0, int(width * 0.54)) :]

    best_left = ""
    best_center = ""
    best_right = ""

    for processed in preprocess_plate_variants(left).values():
        candidate = digits_only(read_with_easyocr(processed, ["en"], Path(ocr_dir), allowlist="0123456789"))
        if len(candidate) > len(best_left):
            best_left = candidate

    for processed in preprocess_plate_variants(center).values():
        candidate = arabic_only(read_with_easyocr(processed, languages, Path(ocr_dir)))
        if ARABIC_TUNIS in candidate:
            best_center = ARABIC_TUNIS
            break
        if len(candidate) > len(best_center):
            best_center = candidate

    for processed in preprocess_plate_variants(right).values():
        candidate = digits_only(read_with_easyocr(processed, ["en"], Path(ocr_dir), allowlist="0123456789"))
        if len(candidate) > len(best_right):
            best_right = candidate

    if best_left or best_center or best_right:
        if not best_center:
            best_center = ARABIC_TUNIS
        return f"{best_left} {best_center} {best_right}".strip()

    return ""


def read_best_plate_text(crop, languages, ocr_dir, ocr_engine="auto", paddle_cache_dir=DEFAULT_PADDLE_CACHE_DIR):
    best_text = ""
    best_score = -10**9

    if ocr_engine in ("auto", "paddle"):
        paddle_text, paddle_score = structured_tunisian_read_paddle(crop, Path(paddle_cache_dir))
        if paddle_score > best_score:
            best_text = paddle_text
            best_score = paddle_score

    if ocr_engine in ("auto", "easyocr"):
        structured_text = structured_tunisian_read(crop, languages, ocr_dir)
        compact_text = reconstruct_tunisian_from_compact_digits(compact_digits_read(crop, ocr_dir))

        structured_score = score_plate_candidate(structured_text)
        if structured_score > best_score:
            best_text = structured_text
            best_score = structured_score

        compact_score = score_plate_candidate(compact_text)
        if compact_score > best_score:
            best_text = compact_text
            best_score = compact_score

        for processed in preprocess_plate_variants(crop).values():
            candidate = read_with_easyocr(processed, languages, Path(ocr_dir))
            candidate_score = score_plate_candidate(candidate)
            if candidate_score >= best_score:
                best_score = candidate_score
                best_text = candidate

    return canonicalize_tunisian_plate(best_text), best_score


def encode_image_to_base64(image):
    ok, buffer = cv2.imencode(".jpg", image)
    if not ok:
        return None
    return base64.b64encode(buffer.tobytes()).decode("utf-8")


def recognize_plate_in_image(image, model_path, conf, languages, ocr_dir, ocr_engine="auto", paddle_cache_dir=DEFAULT_PADDLE_CACHE_DIR):
    detections = detect_plates_from_image(image, model_path, conf)

    if not detections:
        return {
            "status": "ok",
            "plate_text": None,
            "normalized_plate": None,
            "confidence": None,
            "bbox": None,
            "raw_text": None,
            "annotated_image_base64": None,
        }

    best_detection = None
    best_text = ""
    best_total_score = -10**9
    for detection in detections[:5]:
        candidate_text, text_score = read_best_plate_text(
            detection["crop"],
            languages,
            ocr_dir,
            ocr_engine=ocr_engine,
            paddle_cache_dir=paddle_cache_dir,
        )
        total_score = text_score + detection["detection_score"]
        if total_score > best_total_score:
            best_total_score = total_score
            best_detection = detection
            best_text = candidate_text

    crop = best_detection["crop"]
    score = best_detection["confidence"]
    bbox = best_detection["bbox"]
    text = best_text
    normalized = normalize_plate(text)

    annotated = image.copy()
    if bbox:
        x = int(bbox["x"])
        y = int(bbox["y"])
        w = int(bbox["w"])
        h = int(bbox["h"])
        cv2.rectangle(annotated, (x, y), (x + w, y + h), (0, 200, 255), 2)
        if text:
            cv2.putText(
                annotated,
                text,
                (x, max(20, y - 8)),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.7,
                (0, 200, 255),
                2,
                cv2.LINE_AA,
            )

    return {
        "status": "ok",
        "plate_text": text or None,
        "normalized_plate": normalized,
        "confidence": score,
        "bbox": bbox,
        "raw_text": text or None,
        "annotated_image_base64": encode_image_to_base64(annotated),
    }


def main():
    parser = argparse.ArgumentParser(
        description="Detecte une plaque avec YOLO puis lit la matricule avec EasyOCR."
    )
    parser.add_argument("--image", default="test1.jpg", help="Chemin de l'image a analyser.")
    parser.add_argument(
        "--model",
        default=str(DEFAULT_MODEL),
        help="Chemin du modele YOLO entraine.",
    )
    parser.add_argument(
        "--conf",
        type=float,
        default=0.25,
        help="Seuil de confiance pour la detection YOLO.",
    )
    parser.add_argument(
        "--langs",
        nargs="+",
        default=["en"],
        help="Langues EasyOCR, ex: --langs en ar",
    )
    parser.add_argument(
        "--save-crop",
        default="plate_crop.jpg",
        help="Chemin de sauvegarde du crop de la plaque.",
    )
    parser.add_argument(
        "--ocr-dir",
        default=str(DEFAULT_OCR_DIR),
        help="Dossier local pour les modeles EasyOCR.",
    )
    parser.add_argument(
        "--ocr-engine",
        choices=["auto", "easyocr", "paddle"],
        default="auto",
        help="Moteur OCR a utiliser.",
    )
    parser.add_argument(
        "--paddle-cache-dir",
        default=str(DEFAULT_PADDLE_CACHE_DIR),
        help="Dossier local pour le cache PaddleOCR.",
    )
    args = parser.parse_args()

    image_path = Path(args.image)
    model_path = Path(args.model)

    if not image_path.exists():
        print(f"Image introuvable: {image_path}")
        sys.exit(1)

    if not model_path.exists():
        print(f"Modele introuvable: {model_path}")
        sys.exit(1)

    image = load_image(Path(image_path))
    if image is None:
        print(f"Impossible de lire l'image: {image_path}")
        sys.exit(1)

    detections = detect_plates_from_image(image, model_path, args.conf)
    if not detections:
        print("Aucune plaque detectee sur cette image.")
        sys.exit(0)

    best_detection = None
    text = ""
    best_total_score = -10**9
    for detection in detections[:5]:
        candidate_text, text_score = read_best_plate_text(
            detection["crop"],
            args.langs,
            args.ocr_dir,
            ocr_engine=args.ocr_engine,
            paddle_cache_dir=args.paddle_cache_dir,
        )
        total_score = text_score + detection["detection_score"]
        if total_score > best_total_score:
            best_total_score = total_score
            best_detection = detection
            text = candidate_text

    crop = best_detection["crop"]
    score = best_detection["confidence"]
    save_image(Path(args.save_crop), crop)

    print(f"Detection OK (confidence={score:.3f})")
    print(f"Crop sauvegarde: {args.save_crop}")
    print(f"Matricule lue: {text if text else '[aucun texte reconnu]'}")


if __name__ == "__main__":
    main()

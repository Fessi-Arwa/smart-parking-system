from datetime import datetime
from flask import Blueprint, jsonify, request

from .. import db
from ..models.detection import DetectionIA, DetectionPlace, DetectionVehicule


ai_bp = Blueprint("ai", __name__)


def _detection_to_dict(detection):
    place_detection = DetectionPlace.query.get(detection.id_detect)
    vehicule_detection = DetectionVehicule.query.get(detection.id_detect)

    data = {
        "id_detect": detection.id_detect,
        **detection.to_dict(),
        "type_detection": "detection_ia",
    }

    if place_detection:
        data["type_detection"] = "detection_place"
        data["place_id"] = place_detection.place_id
        data["etat_detecte"] = place_detection.serialize_value(place_detection.etat_detecte)

    if vehicule_detection:
        data["type_detection"] = "detection_vehicule"
        data["parking_id"] = vehicule_detection.parking_id
        data["vehicule_id"] = vehicule_detection.vehicule_id
        data["mat_detect"] = vehicule_detection.mat_detect

    return data


def _parse_datetime(value):
    if value is None or isinstance(value, datetime):
        return value
    return datetime.fromisoformat(value)


@ai_bp.route("/", methods=["GET"])
def get_detections():
    detections = DetectionIA.query.order_by(DetectionIA.id_detect.desc()).all()
    return jsonify([_detection_to_dict(detection) for detection in detections])


@ai_bp.route("/<int:detection_id>", methods=["GET"])
def get_detection(detection_id):
    detection = DetectionIA.query.get(detection_id)
    if not detection:
        return jsonify({"error": "Detection not found"}), 404
    return jsonify(_detection_to_dict(detection))


@ai_bp.route("/place", methods=["POST"])
def create_place_detection():
    data = request.get_json() or {}
    if data.get("place_id") is None or data.get("etat_detecte") is None:
        return jsonify({"error": "place_id and etat_detecte are required"}), 400

    detection = DetectionIA(
        image_src=data.get("image_src"),
        date_detect=_parse_datetime(data.get("date_detect")),
    )
    db.session.add(detection)
    db.session.flush()

    detection_place = DetectionPlace(
        id_detect=detection.id_detect,
        place_id=data["place_id"],
        etat_detecte=data["etat_detecte"],
    )
    db.session.add(detection_place)
    db.session.commit()

    return jsonify(_detection_to_dict(detection)), 201


@ai_bp.route("/vehicule", methods=["POST"])
def create_vehicle_detection():
    data = request.get_json() or {}

    detection = DetectionIA(
        image_src=data.get("image_src"),
        date_detect=_parse_datetime(data.get("date_detect")),
    )
    db.session.add(detection)
    db.session.flush()

    detection_vehicule = DetectionVehicule(
        id_detect=detection.id_detect,
        parking_id=data.get("parking_id"),
        vehicule_id=data.get("vehicule_id"),
        mat_detect=data.get("mat_detect"),
    )
    db.session.add(detection_vehicule)
    db.session.commit()

    return jsonify(_detection_to_dict(detection)), 201


@ai_bp.route("/<int:detection_id>", methods=["PUT"])
def update_detection(detection_id):
    detection = DetectionIA.query.get(detection_id)
    if not detection:
        return jsonify({"error": "Detection not found"}), 404

    data = request.get_json() or {}

    if "image_src" in data:
        detection.image_src = data["image_src"]
    if "date_detect" in data:
        detection.date_detect = _parse_datetime(data["date_detect"])

    detection_place = DetectionPlace.query.get(detection_id)
    detection_vehicule = DetectionVehicule.query.get(detection_id)

    if detection_place:
        if "place_id" in data:
            detection_place.place_id = data["place_id"]
        if "etat_detecte" in data:
            detection_place.etat_detecte = data["etat_detecte"]

    if detection_vehicule:
        for field in ("parking_id", "vehicule_id", "mat_detect"):
            if field in data:
                setattr(detection_vehicule, field, data[field])

    db.session.commit()
    return jsonify(_detection_to_dict(detection))


@ai_bp.route("/<int:detection_id>", methods=["DELETE"])
def delete_detection(detection_id):
    detection = DetectionIA.query.get(detection_id)
    if not detection:
        return jsonify({"error": "Detection not found"}), 404

    db.session.delete(detection)
    db.session.commit()
    return jsonify({"msg": "Detection deleted"})

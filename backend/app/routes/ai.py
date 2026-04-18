from datetime import datetime
from flask import Blueprint, current_app, jsonify, request, send_file
from flask_jwt_extended import get_jwt_identity, jwt_required

from .. import db
from ..models.compte import Compte, RoleCompte, StatutValidationOwner
from ..models.detection import DetectionIA, DetectionPlace, DetectionVehicule
from ..models.parking import Parking
from ..services.video_ai_service import ParkingVideoAIService


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


def _get_owner_user(require_approved_owner=True):
    user_id = get_jwt_identity()
    user = Compte.query.get(int(user_id))

    if not user:
        return None, (jsonify({"msg": "Utilisateur introuvable"}), 404)

    if user.role != RoleCompte.owner:
        return None, (jsonify({"msg": "Seuls les owners peuvent utiliser ce module IA"}), 403)

    if require_approved_owner and user.owner_status != StatutValidationOwner.accepte:
        return None, (jsonify({"msg": "Le compte owner doit etre accepte pour acceder au module IA"}), 403)

    return user, None


def _get_owner_parking(user, parking_id):
    return Parking.query.filter_by(id_park=parking_id, owner_id=user.id_compte).first()


def _get_admin_user():
    user_id = get_jwt_identity()
    user = Compte.query.get(int(user_id))

    if not user:
        return None, (jsonify({"msg": "Utilisateur introuvable"}), 404)

    if user.role != RoleCompte.admin:
        return None, (jsonify({"msg": "Acces reserve aux admins"}), 403)

    return user, None


def _get_video_service():
    return ParkingVideoAIService(current_app.config["UPLOAD_FOLDER"], current_app._get_current_object())


@ai_bp.route("/", methods=["GET"])
@jwt_required()
def get_detections():
    _, error_response = _get_admin_user()
    if error_response:
        return error_response

    detections = DetectionIA.query.order_by(DetectionIA.id_detect.desc()).all()
    return jsonify([_detection_to_dict(detection) for detection in detections])


@ai_bp.route("/<int:detection_id>", methods=["GET"])
@jwt_required()
def get_detection(detection_id):
    _, error_response = _get_admin_user()
    if error_response:
        return error_response

    detection = DetectionIA.query.get(detection_id)
    if not detection:
        return jsonify({"error": "Detection not found"}), 404
    return jsonify(_detection_to_dict(detection))


@ai_bp.route("/place", methods=["POST"])
@jwt_required()
def create_place_detection():
    _, error_response = _get_admin_user()
    if error_response:
        return error_response

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
@jwt_required()
def create_vehicle_detection():
    _, error_response = _get_admin_user()
    if error_response:
        return error_response

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
@jwt_required()
def update_detection(detection_id):
    _, error_response = _get_admin_user()
    if error_response:
        return error_response

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
@jwt_required()
def delete_detection(detection_id):
    _, error_response = _get_admin_user()
    if error_response:
        return error_response

    detection = DetectionIA.query.get(detection_id)
    if not detection:
        return jsonify({"error": "Detection not found"}), 404

    db.session.delete(detection)
    db.session.commit()
    return jsonify({"msg": "Detection deleted"})


@ai_bp.route("/parkings/<int:parking_id>/video-batch/history", methods=["GET"])
@jwt_required()
def get_video_batch_history(parking_id):
    user, error_response = _get_owner_user()
    if error_response:
        return error_response

    parking = _get_owner_parking(user, parking_id)
    if not parking:
        return jsonify({"msg": "Parking introuvable"}), 404

    service = _get_video_service()
    return jsonify(service.get_history(parking.id_park)), 200


@ai_bp.route("/parkings/<int:parking_id>/video-batch/process", methods=["POST"])
@jwt_required()
def process_parking_videos(parking_id):
    user, error_response = _get_owner_user()
    if error_response:
        return error_response

    parking = _get_owner_parking(user, parking_id)
    if not parking:
        return jsonify({"msg": "Parking introuvable"}), 404

    files = [file for file in request.files.getlist("videos") if file and file.filename]
    if not files:
        return jsonify({"msg": "Ajoutez au moins une video a traiter"}), 400

    service = _get_video_service()
    try:
        job = service.enqueue_batch_job(parking.id_park, files)
    except ValueError as exc:
        return jsonify({"msg": str(exc)}), 400

    return jsonify(job), 202


@ai_bp.route("/parkings/<int:parking_id>/video-batch/jobs/<job_id>", methods=["GET"])
@jwt_required()
def get_video_batch_job(parking_id, job_id):
    user, error_response = _get_owner_user()
    if error_response:
        return error_response

    parking = _get_owner_parking(user, parking_id)
    if not parking:
        return jsonify({"msg": "Parking introuvable"}), 404

    service = _get_video_service()
    job = service.get_batch_job(parking.id_park, job_id)
    if not job:
        return jsonify({"msg": "Job batch introuvable"}), 404

    return jsonify(job), 200


@ai_bp.route("/parkings/<int:parking_id>/video-results/<result_id>/stream", methods=["GET"])
@jwt_required()
def stream_video_result(parking_id, result_id):
    user, error_response = _get_owner_user()
    if error_response:
        return error_response

    parking = _get_owner_parking(user, parking_id)
    if not parking:
        return jsonify({"msg": "Parking introuvable"}), 404

    service = _get_video_service()
    output_path = service.resolve_output_path(parking_id, result_id)
    if not output_path:
        return jsonify({"msg": "Video resultat introuvable"}), 404

    return send_file(output_path, mimetype="video/mp4")


@ai_bp.route("/parkings/<int:parking_id>/video-results/<result_id>/download", methods=["GET"])
@jwt_required()
def download_video_result(parking_id, result_id):
    user, error_response = _get_owner_user()
    if error_response:
        return error_response

    parking = _get_owner_parking(user, parking_id)
    if not parking:
        return jsonify({"msg": "Parking introuvable"}), 404

    service = _get_video_service()
    output_path = service.resolve_output_path(parking_id, result_id)
    if not output_path:
        return jsonify({"msg": "Video resultat introuvable"}), 404

    return send_file(output_path, mimetype="video/mp4", as_attachment=True, download_name=output_path.name)

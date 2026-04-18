from datetime import date, timedelta
from pathlib import Path
from uuid import uuid4

from flask import Blueprint, current_app, jsonify, request, send_file
from flask_jwt_extended import get_jwt_identity, jwt_required
from werkzeug.utils import secure_filename

from .. import db
from ..models.abonnement import Abonnement, StatutAbonnement, TypeAbonnement
from ..models.abonnement_app import AbonnementApp
from ..models.compte import Compte, RoleCompte, StatutValidationOwner
from ..models.parking_ai_source import ParkingAISource, TypeSourceIA
from ..models.parking import (
    Parking,
    StatutConfigurationIA,
    StatutConfigurationParking,
    StatutValidationParking,
)
from ..models.place import Place
from ..services.ai_service import ParkingSourceAIService


owner_workflow_bp = Blueprint("owner_workflow", __name__)


SUBSCRIPTION_PRICING = {
    TypeAbonnement.mensuel: {"days": 30, "price": 49},
    TypeAbonnement.trimestriel: {"days": 90, "price": 135},
    TypeAbonnement.annuel: {"days": 365, "price": 490},
}


def _get_owner_user():
    user_id = get_jwt_identity()
    user = Compte.query.get(int(user_id))

    if not user:
        return None, (jsonify({"msg": "Utilisateur introuvable"}), 404)

    if user.role != RoleCompte.owner:
        return None, (jsonify({"msg": "Seuls les owners peuvent consulter ce workflow"}), 403)

    return user, None


def _get_owner_parking(user, parking_id=None):
    query = Parking.query.filter_by(owner_id=user.id_compte)

    if parking_id is not None:
        parking = query.filter_by(id_park=parking_id).first()
    else:
        parking = query.order_by(Parking.created_at.desc(), Parking.id_park.desc()).first()

    return parking


def _get_subscription_status_for_parking(parking):
    if not parking:
        return "non_souscrit"

    abonnement_app_link = (
        AbonnementApp.query.filter_by(parking_id=parking.id_park)
        .order_by(AbonnementApp.id_abon.desc())
        .first()
    )
    if not abonnement_app_link:
        return "non_souscrit"

    abonnement = Abonnement.query.get(abonnement_app_link.id_abon)
    if not abonnement:
        return "non_souscrit"

    if abonnement.statut == StatutAbonnement.actif:
        return "actif"
    if abonnement.statut == StatutAbonnement.en_attente:
        return "en_attente_paiement"
    return abonnement.statut.value


def _ensure_parking_validated(parking):
    if parking.validation_status != StatutValidationParking.valide:
        return jsonify({"msg": "Le parking doit etre valide par l admin avant cette etape"}), 400
    return None


def _ensure_subscription_active(parking):
    subscription_status = _get_subscription_status_for_parking(parking)
    if subscription_status != "actif":
        return jsonify({"msg": "Activez d abord l abonnement de l application pour ce parking"}), 400
    return None


def _ensure_parking_ready_for_setup(parking):
    return _ensure_parking_validated(parking) or _ensure_subscription_active(parking)


def _ensure_parking_ready_for_ai(parking):
    setup_error = _ensure_parking_ready_for_setup(parking)
    if setup_error:
        return setup_error
    if parking.setup_status != StatutConfigurationParking.terminee:
        return jsonify({"msg": "Terminez d abord la configuration parking avant d utiliser l IA"}), 400
    return None


def _get_ai_source_service():
    return ParkingSourceAIService(current_app.config["UPLOAD_FOLDER"])


def _get_latest_app_subscription_for_parking(parking):
    if not parking:
        return None, None

    abonnement_app_link = (
        AbonnementApp.query.filter_by(parking_id=parking.id_park)
        .order_by(AbonnementApp.id_abon.desc())
        .first()
    )
    if not abonnement_app_link:
        return None, None

    abonnement = Abonnement.query.get(abonnement_app_link.id_abon)
    return abonnement_app_link, abonnement


def _get_workflow_rank(parking, subscription_status):
    if not parking:
        return 0

    if parking.validation_status != StatutValidationParking.valide:
        return 1
    if subscription_status != "actif":
        return 2
    if parking.setup_status != StatutConfigurationParking.terminee:
        return 3
    if parking.ai_setup_status != StatutConfigurationIA.active:
        return 4
    return 5


def _select_workflow_parking(user):
    parkings = (
        Parking.query.filter_by(owner_id=user.id_compte)
        .order_by(Parking.created_at.desc(), Parking.id_park.desc())
        .all()
    )
    if not parkings:
        return None, "non_souscrit"

    workflow_candidates: list[tuple[Parking, str, int]] = []
    completed_candidates: list[tuple[Parking, str, int]] = []

    for parking in parkings:
        subscription_status = _get_subscription_status_for_parking(parking)
        rank = _get_workflow_rank(parking, subscription_status)
        candidate = (parking, subscription_status, rank)

        if rank < 5:
            workflow_candidates.append(candidate)
        else:
            completed_candidates.append(candidate)

    if workflow_candidates:
        parking, subscription_status, _ = workflow_candidates[0]
        return parking, subscription_status

    parking, subscription_status, _ = completed_candidates[0]
    return parking, subscription_status


def _source_to_dict(source, ai_service=None):
    data = source.to_dict()
    data["preview_url"] = f"/api/owner/ai-sources/{source.id_source}/file" if source.file_path else None
    data["calibration_preview_url"] = None
    try:
        service = ai_service or _get_ai_source_service()
        data["analysis"] = service.get_analysis(source.id_source)
        calibration_path, _ = service.extract_calibration_frame(source)
        if calibration_path:
            data["calibration_preview_url"] = f"/api/owner/ai-sources/{source.id_source}/calibration-frame"
    except Exception as exc:
        data["analysis"] = {
            "source_id": source.id_source,
            "parking_id": source.parking_id,
            "source_type": source.source_type.value,
            "status": "error",
            "error": str(exc),
        }
    return data


@owner_workflow_bp.route("/workflow-status", methods=["GET"])
@jwt_required()
def get_owner_workflow_status():
    user, error_response = _get_owner_user()
    if error_response:
        return error_response

    parking, subscription_status = _select_workflow_parking(user)

    return jsonify(
        {
            "ownerStatus": (user.owner_status or StatutValidationOwner.en_attente).value,
            "parkingStatus": (
                parking.validation_status.value
                if parking and parking.validation_status
                else StatutValidationParking.brouillon.value
            ),
            "subscriptionStatus": subscription_status,
            "parkingSetupStatus": (
                parking.setup_status.value
                if parking and parking.setup_status
                else StatutConfigurationParking.non_commencee.value
            ),
            "aiSetupStatus": (
                parking.ai_setup_status.value
                if parking and parking.ai_setup_status
                else StatutConfigurationIA.non_configuree.value
            ),
            "parkingId": parking.id_park if parking else None,
            "parkingName": parking.nom if parking else None,
            "hasParking": parking is not None,
        }
    ), 200


@owner_workflow_bp.route("/app-subscription", methods=["POST"])
@jwt_required()
def activate_app_subscription():
    user, error_response = _get_owner_user()
    if error_response:
        return error_response

    data = request.get_json() or {}
    parking_id = data.get("parking_id")
    raw_type = data.get("type", TypeAbonnement.mensuel.value)

    try:
        subscription_type = TypeAbonnement(raw_type)
    except ValueError:
        return jsonify({"msg": "Type d abonnement invalide"}), 400

    if subscription_type not in SUBSCRIPTION_PRICING:
        return jsonify({"msg": "Type d abonnement non pris en charge"}), 400

    parking = _get_owner_parking(user, parking_id)
    if not parking:
        return jsonify({"msg": "Aucun parking owner trouve"}), 404

    pricing = SUBSCRIPTION_PRICING[subscription_type]
    start_date = date.today()
    end_date = start_date + timedelta(days=pricing["days"])
    _, abonnement = _get_latest_app_subscription_for_parking(parking)

    if abonnement and abonnement.statut in (StatutAbonnement.en_attente, StatutAbonnement.suspendu):
        abonnement.type = subscription_type
        abonnement.date_debut = start_date
        abonnement.date_fin = end_date
        abonnement.tarif = pricing["price"]
        abonnement.statut = StatutAbonnement.en_attente
    elif abonnement and abonnement.statut == StatutAbonnement.actif:
        return jsonify({"msg": "Un abonnement actif existe deja pour ce parking"}), 400
    else:
        abonnement = Abonnement(
            type=subscription_type,
            date_debut=start_date,
            date_fin=end_date,
            statut=StatutAbonnement.en_attente,
            tarif=pricing["price"],
        )
        db.session.add(abonnement)
        db.session.flush()

        db.session.add(
            AbonnementApp(
                id_abon=abonnement.id_abon,
                parking_id=parking.id_park,
            )
        )

    db.session.commit()
    return jsonify(
        {
            "msg": "Abonnement application soumis. En attente de validation admin.",
            "abonnement": abonnement.to_dict(),
            "parkingId": parking.id_park,
            "parkingName": parking.nom,
        }
    ), 200


@owner_workflow_bp.route("/parkings/<int:parking_id>/setup-status", methods=["PUT"])
@jwt_required()
def update_parking_setup_status(parking_id):
    user, error_response = _get_owner_user()
    if error_response:
        return error_response

    parking = Parking.query.get(parking_id)
    if not parking:
        return jsonify({"msg": "Parking introuvable"}), 404

    if parking.owner_id != user.id_compte:
        return jsonify({"msg": "Vous ne pouvez modifier que votre parking"}), 403
    setup_error = _ensure_parking_ready_for_setup(parking)
    if setup_error:
        return setup_error

    data = request.get_json() or {}
    status = data.get("setup_status")

    try:
        parking.setup_status = StatutConfigurationParking(status)
    except ValueError:
        return jsonify({"msg": "setup_status invalide"}), 400

    db.session.commit()
    return jsonify(parking.to_dict()), 200


@owner_workflow_bp.route("/parkings/<int:parking_id>/ai-setup-status", methods=["PUT"])
@jwt_required()
def update_ai_setup_status(parking_id):
    user, error_response = _get_owner_user()
    if error_response:
        return error_response

    parking = Parking.query.get(parking_id)
    if not parking:
        return jsonify({"msg": "Parking introuvable"}), 404

    if parking.owner_id != user.id_compte:
        return jsonify({"msg": "Vous ne pouvez modifier que votre parking"}), 403
    ai_error = _ensure_parking_ready_for_ai(parking)
    if ai_error:
        return ai_error

    data = request.get_json() or {}
    status = data.get("ai_setup_status")

    try:
        next_status = StatutConfigurationIA(status)
    except ValueError:
        return jsonify({"msg": "ai_setup_status invalide"}), 400

    if next_status == StatutConfigurationIA.active:
        sources_count = ParkingAISource.query.filter_by(parking_id=parking.id_park).count()
        if sources_count == 0:
            return jsonify({"msg": "Ajoutez au moins une source IA avant activation"}), 400

    parking.ai_setup_status = next_status

    db.session.commit()
    return jsonify(parking.to_dict()), 200


@owner_workflow_bp.route("/parkings/<int:parking_id>/ai-sources", methods=["GET"])
@jwt_required()
def get_ai_sources(parking_id):
    user, error_response = _get_owner_user()
    if error_response:
        return error_response

    parking = _get_owner_parking(user, parking_id)
    if not parking:
        return jsonify({"msg": "Parking introuvable"}), 404
    ai_error = _ensure_parking_ready_for_ai(parking)
    if ai_error:
        return ai_error

    sources = (
        ParkingAISource.query.filter_by(parking_id=parking.id_park)
        .order_by(ParkingAISource.created_at.desc(), ParkingAISource.id_source.desc())
        .all()
    )
    try:
        ai_service = _get_ai_source_service()
    except Exception:
        ai_service = None
    return jsonify([_source_to_dict(source, ai_service=ai_service) for source in sources]), 200


@owner_workflow_bp.route("/parkings/<int:parking_id>/ai-sources/camera", methods=["POST"])
@jwt_required()
def create_camera_source(parking_id):
    user, error_response = _get_owner_user()
    if error_response:
        return error_response

    parking = _get_owner_parking(user, parking_id)
    if not parking:
        return jsonify({"msg": "Parking introuvable"}), 404
    ai_error = _ensure_parking_ready_for_ai(parking)
    if ai_error:
        return ai_error

    data = request.get_json() or {}
    stream_url = (data.get("stream_url") or "").strip()
    if not stream_url:
        return jsonify({"msg": "stream_url est obligatoire"}), 400

    source = ParkingAISource(
        parking_id=parking.id_park,
        source_type=TypeSourceIA.camera,
        label=(data.get("label") or "Camera surveillance").strip() or "Camera surveillance",
        stream_url=stream_url,
    )
    db.session.add(source)
    db.session.commit()
    return jsonify(_source_to_dict(source)), 201


@owner_workflow_bp.route("/parkings/<int:parking_id>/ai-sources/upload", methods=["POST"])
@jwt_required()
def upload_ai_source(parking_id):
    user, error_response = _get_owner_user()
    if error_response:
        return error_response

    parking = _get_owner_parking(user, parking_id)
    if not parking:
        return jsonify({"msg": "Parking introuvable"}), 404
    ai_error = _ensure_parking_ready_for_ai(parking)
    if ai_error:
        return ai_error

    file = request.files.get("file")
    if not file or not file.filename:
        return jsonify({"msg": "Aucun fichier fourni"}), 400

    source_type_value = (request.form.get("source_type") or "").strip()
    label = (request.form.get("label") or "").strip()

    try:
        source_type = TypeSourceIA(source_type_value)
    except ValueError:
        return jsonify({"msg": "source_type invalide"}), 400

    if source_type == TypeSourceIA.camera:
        return jsonify({"msg": "Utilisez la route camera pour les flux de surveillance"}), 400

    upload_root = Path(current_app.config["UPLOAD_FOLDER"]) / "parking_media" / str(parking.id_park)
    upload_root.mkdir(parents=True, exist_ok=True)

    safe_name = secure_filename(file.filename) or f"{source_type.value}_{uuid4().hex}"
    filename = f"{uuid4().hex}_{safe_name}"
    file_path = upload_root / filename
    file.save(file_path)

    source = ParkingAISource(
        parking_id=parking.id_park,
        source_type=source_type,
        label=label or file.filename,
        file_path=str(file_path),
        original_name=file.filename,
        mime_type=file.mimetype,
    )
    db.session.add(source)
    db.session.commit()

    analysis = None
    if source_type == TypeSourceIA.image:
        try:
            analysis = _get_ai_source_service().analyze_source(source)
        except Exception as exc:
            analysis = {
                "source_id": source.id_source,
                "parking_id": source.parking_id,
                "source_type": source.source_type.value,
                "status": "error",
                "error": str(exc),
            }

    payload = _source_to_dict(source)
    if analysis is not None:
        payload["analysis"] = analysis
    return jsonify(payload), 201


@owner_workflow_bp.route("/parkings/<int:parking_id>/ai-slots", methods=["GET"])
@jwt_required()
def get_ai_slots(parking_id):
    user, error_response = _get_owner_user()
    if error_response:
        return error_response

    parking = _get_owner_parking(user, parking_id)
    if not parking:
        return jsonify({"msg": "Parking introuvable"}), 404
    ai_error = _ensure_parking_ready_for_ai(parking)
    if ai_error:
        return ai_error

    service = _get_ai_source_service().video_service
    slots = service.get_saved_parking_slots(parking.id_park)
    return jsonify(
        {
            "slots": slots,
            "slots_path": str(service.get_slots_config_path(parking.id_park)),
            "uses_custom_slots": bool(slots),
        }
    ), 200


@owner_workflow_bp.route("/parkings/<int:parking_id>/ai-slots", methods=["PUT"])
@jwt_required()
def save_ai_slots(parking_id):
    user, error_response = _get_owner_user()
    if error_response:
        return error_response

    parking = _get_owner_parking(user, parking_id)
    if not parking:
        return jsonify({"msg": "Parking introuvable"}), 404
    ai_error = _ensure_parking_ready_for_ai(parking)
    if ai_error:
        return ai_error

    payload = request.get_json() or {}
    raw_slots = payload.get("slots")
    if not isinstance(raw_slots, list) or not raw_slots:
        return jsonify({"msg": "Ajoutez au moins un slot a sauvegarder"}), 400

    valid_place_ids = {
        place.id_place
        for place in Place.query.filter_by(parking_id=parking.id_park).all()
    }

    normalized_slots = []
    seen_place_ids = set()
    for index, slot in enumerate(raw_slots, start=1):
        if not isinstance(slot, dict):
            return jsonify({"msg": f"Le slot #{index} est invalide"}), 400

        try:
            place_id = int(slot["place_id"])
            x = int(slot["x"])
            y = int(slot["y"])
            w = int(slot["w"])
            h = int(slot["h"])
        except (KeyError, TypeError, ValueError):
            return jsonify({"msg": f"Le slot #{index} doit contenir place_id, x, y, w et h"}), 400

        if place_id not in valid_place_ids:
            return jsonify({"msg": f"Le place_id {place_id} n appartient pas a ce parking"}), 400
        if place_id in seen_place_ids:
            return jsonify({"msg": f"Le place_id {place_id} est utilise plusieurs fois"}), 400
        if w <= 0 or h <= 0:
            return jsonify({"msg": f"Le slot #{index} doit avoir une largeur et une hauteur positives"}), 400

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

    service = _get_ai_source_service().video_service
    slots_path = service.save_parking_slots(parking.id_park, normalized_slots)
    return jsonify({"slots": normalized_slots, "slots_path": str(slots_path)}), 200


@owner_workflow_bp.route("/ai-sources/<int:source_id>", methods=["DELETE"])
@jwt_required()
def delete_ai_source(source_id):
    user, error_response = _get_owner_user()
    if error_response:
        return error_response

    source = ParkingAISource.query.get(source_id)
    if not source:
        return jsonify({"msg": "Source IA introuvable"}), 404

    parking = _get_owner_parking(user, source.parking_id)
    if not parking:
        return jsonify({"msg": "Acces non autorise"}), 403

    if source.file_path:
        path = Path(source.file_path)
        if path.exists():
            path.unlink()

    try:
        _get_ai_source_service().delete_analysis(source.id_source)
    except Exception:
        pass

    db.session.delete(source)
    db.session.commit()
    return jsonify({"msg": "Source IA supprimee"}), 200


@owner_workflow_bp.route("/ai-sources/<int:source_id>/reanalyze", methods=["POST"])
@jwt_required()
def reanalyze_ai_source(source_id):
    user, error_response = _get_owner_user()
    if error_response:
        return error_response

    source = ParkingAISource.query.get(source_id)
    if not source:
        return jsonify({"msg": "Source IA introuvable"}), 404

    parking = _get_owner_parking(user, source.parking_id)
    if not parking:
        return jsonify({"msg": "Acces non autorise"}), 403

    if source.source_type == TypeSourceIA.camera:
        return jsonify({"msg": "Le retraitement n est pas disponible pour les cameras"}), 400

    service = _get_ai_source_service()
    try:
        if source.source_type == TypeSourceIA.video:
            analysis = service.enqueue_video_analysis(source)
            payload = _source_to_dict(source, ai_service=service)
            payload["analysis"] = analysis
            return jsonify(payload), 202

        analysis = service.analyze_source(source)
    except Exception as exc:
        return jsonify({"msg": str(exc)}), 400

    payload = _source_to_dict(source, ai_service=service)
    payload["analysis"] = analysis
    return jsonify(payload), 200


@owner_workflow_bp.route("/ai-sources/<int:source_id>/file", methods=["GET"])
def get_ai_source_file(source_id):
    source = ParkingAISource.query.get(source_id)
    if not source or not source.file_path:
        return jsonify({"msg": "Fichier introuvable"}), 404

    path = Path(source.file_path)
    if not path.exists():
        return jsonify({"msg": "Fichier introuvable"}), 404

    return send_file(path, mimetype=source.mime_type or "application/octet-stream")


@owner_workflow_bp.route("/ai-sources/<int:source_id>/analysis-file", methods=["GET"])
def get_ai_source_analysis_file(source_id):
    source = ParkingAISource.query.get(source_id)
    if not source:
        return jsonify({"msg": "Source IA introuvable"}), 404

    try:
        path, mimetype = _get_ai_source_service().resolve_output_path(source_id)
    except Exception as exc:
        return jsonify({"msg": str(exc)}), 500

    if not path:
        return jsonify({"msg": "Fichier d'analyse introuvable"}), 404

    return send_file(path, mimetype=mimetype or "application/octet-stream")


@owner_workflow_bp.route("/ai-sources/<int:source_id>/analysis-preview", methods=["GET"])
def get_ai_source_analysis_preview(source_id):
    source = ParkingAISource.query.get(source_id)
    if not source:
        return jsonify({"msg": "Source IA introuvable"}), 404

    try:
        path, mimetype = _get_ai_source_service().resolve_output_preview_path(source_id)
    except Exception as exc:
        return jsonify({"msg": str(exc)}), 500

    if not path:
        return jsonify({"msg": "Apercu d'analyse introuvable"}), 404

    return send_file(path, mimetype=mimetype or "image/jpeg")


@owner_workflow_bp.route("/ai-sources/<int:source_id>/calibration-frame", methods=["GET"])
@jwt_required(optional=True)
def get_ai_source_calibration_frame(source_id):
    source = ParkingAISource.query.get(source_id)
    if not source:
        return jsonify({"msg": "Source IA introuvable"}), 404

    try:
        path, mimetype = _get_ai_source_service().extract_calibration_frame(source)
    except Exception as exc:
        return jsonify({"msg": str(exc)}), 500

    if not path:
        return jsonify({"msg": "Capture de calibration introuvable"}), 404

    return send_file(path, mimetype=mimetype or "image/jpeg")

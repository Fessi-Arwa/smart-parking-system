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

    workflow_candidates = []
    completed_candidates = []

    for parking in parkings:
        subscription_status = _get_subscription_status_for_parking(parking)
        rank = _get_workflow_rank(parking, subscription_status)
        item = (parking, subscription_status, rank)

        if rank < 5:
            workflow_candidates.append(item)
        else:
            completed_candidates.append(item)

    if workflow_candidates:
        selected_parking, selected_subscription_status, _ = min(
            workflow_candidates,
            key=lambda item: item[2],
        )
        return selected_parking, selected_subscription_status

    selected_parking, selected_subscription_status, _ = completed_candidates[0]
    return selected_parking, selected_subscription_status


def _source_to_dict(source):
    data = source.to_dict()
    data["preview_url"] = f"/api/owner/ai-sources/{source.id_source}/file" if source.file_path else None
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

    sources = (
        ParkingAISource.query.filter_by(parking_id=parking.id_park)
        .order_by(ParkingAISource.created_at.desc(), ParkingAISource.id_source.desc())
        .all()
    )
    return jsonify([_source_to_dict(source) for source in sources]), 200


@owner_workflow_bp.route("/parkings/<int:parking_id>/ai-sources/camera", methods=["POST"])
@jwt_required()
def create_camera_source(parking_id):
    user, error_response = _get_owner_user()
    if error_response:
        return error_response

    parking = _get_owner_parking(user, parking_id)
    if not parking:
        return jsonify({"msg": "Parking introuvable"}), 404

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
    return jsonify(_source_to_dict(source)), 201


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

    db.session.delete(source)
    db.session.commit()
    return jsonify({"msg": "Source IA supprimee"}), 200


@owner_workflow_bp.route("/ai-sources/<int:source_id>/file", methods=["GET"])
def get_ai_source_file(source_id):
    source = ParkingAISource.query.get(source_id)
    if not source or not source.file_path:
        return jsonify({"msg": "Fichier introuvable"}), 404

    path = Path(source.file_path)
    if not path.exists():
        return jsonify({"msg": "Fichier introuvable"}), 404

    return send_file(path, mimetype=source.mime_type or "application/octet-stream")

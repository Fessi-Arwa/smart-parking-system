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

    parking = _get_owner_parking(user)

    abonnement_app_link = None
    abonnement = None
    if parking:
        abonnement_app_link = (
            AbonnementApp.query.filter_by(parking_id=parking.id_park)
            .order_by(AbonnementApp.id_abon.desc())
            .first()
        )
        if abonnement_app_link:
            abonnement = Abonnement.query.get(abonnement_app_link.id_abon)

    subscription_status = "non_souscrit"
    if abonnement:
        if abonnement.statut == StatutAbonnement.actif:
            subscription_status = "actif"
        elif abonnement.statut == StatutAbonnement.en_attente:
            subscription_status = "en_attente_paiement"
        else:
            subscription_status = abonnement.statut.value

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
            "hasParking": parking is not None,
        }
    ), 200


@owner_workflow_bp.route("/app-subscription", methods=["POST"])
@jwt_required()
def activate_app_subscription():
    user, error_response = _get_owner_user()
    if error_response:
        return error_response

    parking = _get_owner_parking(user)
    if not parking:
        return jsonify({"msg": "Aucun parking owner trouve"}), 404

    abonnement_app_link = (
        AbonnementApp.query.filter_by(parking_id=parking.id_park)
        .order_by(AbonnementApp.id_abon.desc())
        .first()
    )

    if abonnement_app_link:
        abonnement = Abonnement.query.get(abonnement_app_link.id_abon)
        if not abonnement:
            return jsonify({"msg": "Abonnement app introuvable"}), 404

        abonnement.statut = StatutAbonnement.actif
    else:
        abonnement = Abonnement(
            type=TypeAbonnement.mensuel,
            date_debut=date.today(),
            date_fin=date.today() + timedelta(days=30),
            statut=StatutAbonnement.actif,
            tarif=49,
        )
        db.session.add(abonnement)
        db.session.flush()

        abonnement_app_link = AbonnementApp(
            id_abon=abonnement.id_abon,
            parking_id=parking.id_park,
        )
        db.session.add(abonnement_app_link)

    db.session.commit()
    return jsonify({"msg": "Abonnement application active avec succes"}), 200


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

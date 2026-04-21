from datetime import date, timedelta
from pathlib import Path
from uuid import uuid4
import shutil

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
from ..services.ai_service import ParkingSourceAIService
from ..services.slot_mapping_service import assign_slots_to_places
from ..services.video_ai_service import ParkingVideoAIService
from ..utils.storage_manager import StorageManager


# Wrapper pour permettre de relire un fichier déjà sauvegardé
class _SavedFileWrapper:
    """Wrapper pour convertir un fichier déjà sauvegardé en objet compatible FileStorage"""
    def __init__(self, filepath, filename):
        self.filepath = Path(filepath)
        self.filename = filename

    def save(self, destination):
        destination_path = Path(destination)
        destination_path.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(str(self.filepath), str(destination_path))


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


def _ensure_owner_approved(user):
    if user.owner_status != StatutValidationOwner.accepte:
        return jsonify({"msg": "Le compte owner doit etre accepte pour acceder a cette fonctionnalite"}), 403
    return None


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

    abonnement.sync_status_with_dates()

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


def _get_video_service():
    return ParkingVideoAIService(current_app.config["UPLOAD_FOLDER"], current_app._get_current_object())


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
    if abonnement:
        abonnement.sync_status_with_dates()
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
    _, abonnement = _get_latest_app_subscription_for_parking(parking)

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
            "subscriptionStartDate": abonnement.date_debut.isoformat() if abonnement else None,
            "subscriptionEndDate": abonnement.date_fin.isoformat() if abonnement else None,
            "subscriptionType": abonnement.type.value if abonnement and abonnement.type else None,
        }
    ), 200


@owner_workflow_bp.route("/app-subscription", methods=["POST"])
@jwt_required()
def activate_app_subscription():
    user, error_response = _get_owner_user()
    if error_response:
        return error_response
    approval_error = _ensure_owner_approved(user)
    if approval_error:
        return approval_error

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
        abonnement.sync_status_with_dates()
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
        abonnement.sync_status_with_dates()
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
    approval_error = _ensure_owner_approved(user)
    if approval_error:
        return approval_error

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
    approval_error = _ensure_owner_approved(user)
    if approval_error:
        return approval_error

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
    approval_error = _ensure_owner_approved(user)
    if approval_error:
        return approval_error

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
    approval_error = _ensure_owner_approved(user)
    if approval_error:
        return approval_error

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
    approval_error = _ensure_owner_approved(user)
    if approval_error:
        return approval_error

    parking = _get_owner_parking(user, parking_id)
    if not parking:
        return jsonify({"msg": "Parking introuvable"}), 404
    ai_error = _ensure_parking_ready_for_ai(parking)
    if ai_error:
        return ai_error

    # Vérifier la taille du fichier avant de le traiter
    max_size = current_app.config.get("MAX_UPLOAD_SIZE", 500 * 1024 * 1024)
    content_length = request.content_length
    if content_length and content_length > max_size:
        return jsonify({
            "msg": f"Fichier trop volumineux. Taille maximale: {max_size / 1024 / 1024:.0f} MB"
        }), 413

    try:
        file = request.files.get("file")
        if not file or not file.filename:
            return jsonify({"msg": "Aucun fichier fourni"}), 400

        # Gestion de l'espace disque
        storage_manager = StorageManager(
            current_app.config["UPLOAD_FOLDER"],
            current_app.config.get("MAX_TOTAL_UPLOADS", 20 * 1024 * 1024 * 1024),
            current_app.config.get("UPLOAD_RETENTION_DAYS", 30)
        )
        
        # Vérifier si l'espace est disponible
        if not storage_manager.ensure_space_available(content_length or 100 * 1024 * 1024):
            return jsonify({
                "msg": "Espace disque insuffisant. Veuillez réessayer plus tard.",
                "storage": storage_manager.get_storage_status()
            }), 507

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
        background_job = None
        
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
        elif source_type == TypeSourceIA.video:
            # Traiter la vidéo en arrière-plan
            try:
                video_service = _get_video_service()
                # Créer un wrapper pour relire le fichier sauvegardé
                file_wrapper = _SavedFileWrapper(file_path, file.filename)
                background_job = video_service.enqueue_batch_job(
                    parking.id_park,
                    [file_wrapper]
                )
            except Exception as exc:
                background_job = {
                    "error": str(exc),
                    "status": "error"
                }

        payload = _source_to_dict(source)
        if analysis is not None:
            payload["analysis"] = analysis
        if background_job is not None:
            payload["background_job"] = background_job
        return jsonify(payload), 201

    except OSError as e:
        if "No space left on device" in str(e) or "Errno 28" in str(e):
            return jsonify({
                "msg": "Espace disque serveur insuffisant. Veuillez contacter l'administrateur.",
                "error": "STORAGE_FULL"
            }), 507
        raise
    except Exception as e:
        return jsonify({
            "msg": f"Erreur lors du traitement du fichier: {str(e)}"
        }), 500


@owner_workflow_bp.route("/parkings/<int:parking_id>/ai-slots", methods=["GET"])
@jwt_required()
def get_ai_slots(parking_id):
    user, error_response = _get_owner_user()
    if error_response:
        return error_response
    approval_error = _ensure_owner_approved(user)
    if approval_error:
        return approval_error

    parking = _get_owner_parking(user, parking_id)
    if not parking:
        return jsonify({"msg": "Parking introuvable"}), 404
    ai_error = _ensure_parking_ready_for_ai(parking)
    if ai_error:
        return ai_error

    service = _get_ai_source_service().video_service
    saved_slots = service.get_saved_parking_slots(parking.id_park)
    uses_custom_slots = bool(saved_slots)
    slots = saved_slots
    if not slots:
        slots, _ = service.get_slots(parking.id_park)

    slot_mapping = assign_slots_to_places(parking.id_park, slots)
    if slot_mapping["changed"]:
        service.save_parking_slots(parking.id_park, slot_mapping["slots"])
        uses_custom_slots = True

    return jsonify(
        {
            "slots": slot_mapping["slots"],
            "slots_path": str(service.get_slots_config_path(parking.id_park)),
            "uses_custom_slots": uses_custom_slots,
            "warning": slot_mapping["warning"],
            "auto_assigned_count": slot_mapping["auto_assigned_count"],
        }
    ), 200


@owner_workflow_bp.route("/parkings/<int:parking_id>/ai-slots", methods=["PUT"])
@jwt_required()
def save_ai_slots(parking_id):
    user, error_response = _get_owner_user()
    if error_response:
        return error_response
    approval_error = _ensure_owner_approved(user)
    if approval_error:
        return approval_error

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

    try:
        normalized = assign_slots_to_places(parking.id_park, raw_slots)
    except ValueError as exc:
        return jsonify({"msg": str(exc)}), 400

    service = _get_ai_source_service().video_service
    slots_path = service.save_parking_slots(parking.id_park, normalized["slots"])
    return jsonify(
        {
            "slots": normalized["slots"],
            "slots_path": str(slots_path),
            "uses_custom_slots": True,
            "warning": normalized["warning"],
            "auto_assigned_count": normalized["auto_assigned_count"],
        }
    ), 200


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
    approval_error = _ensure_owner_approved(user)
    if approval_error:
        return approval_error

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
    approval_error = _ensure_owner_approved(user)
    if approval_error:
        return approval_error

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
@jwt_required()
def get_ai_source_file(source_id):
    user, error_response = _get_owner_user()
    if error_response:
        return error_response
    approval_error = _ensure_owner_approved(user)
    if approval_error:
        return approval_error

    source = ParkingAISource.query.get(source_id)
    if not source or not source.file_path:
        return jsonify({"msg": "Fichier introuvable"}), 404

    parking = _get_owner_parking(user, source.parking_id)
    if not parking:
        return jsonify({"msg": "Acces non autorise"}), 403

    path = Path(source.file_path)
    if not path.exists():
        return jsonify({"msg": "Fichier introuvable"}), 404

    return send_file(path, mimetype=source.mime_type or "application/octet-stream")


@owner_workflow_bp.route("/ai-sources/<int:source_id>/analysis-file", methods=["GET"])
@jwt_required()
def get_ai_source_analysis_file(source_id):
    user, error_response = _get_owner_user()
    if error_response:
        return error_response
    approval_error = _ensure_owner_approved(user)
    if approval_error:
        return approval_error

    source = ParkingAISource.query.get(source_id)
    if not source:
        return jsonify({"msg": "Source IA introuvable"}), 404

    parking = _get_owner_parking(user, source.parking_id)
    if not parking:
        return jsonify({"msg": "Acces non autorise"}), 403

    try:
        path, mimetype = _get_ai_source_service().resolve_output_path(source_id)
    except Exception as exc:
        return jsonify({"msg": str(exc)}), 500

    if not path:
        return jsonify({"msg": "Fichier d'analyse introuvable"}), 404

    return send_file(path, mimetype=mimetype or "application/octet-stream")


@owner_workflow_bp.route("/ai-sources/<int:source_id>/analysis-preview", methods=["GET"])
@jwt_required()
def get_ai_source_analysis_preview(source_id):
    user, error_response = _get_owner_user()
    if error_response:
        return error_response
    approval_error = _ensure_owner_approved(user)
    if approval_error:
        return approval_error

    source = ParkingAISource.query.get(source_id)
    if not source:
        return jsonify({"msg": "Source IA introuvable"}), 404

    parking = _get_owner_parking(user, source.parking_id)
    if not parking:
        return jsonify({"msg": "Acces non autorise"}), 403

    try:
        path, mimetype = _get_ai_source_service().resolve_output_preview_path(source_id)
    except Exception as exc:
        return jsonify({"msg": str(exc)}), 500

    if not path:
        return jsonify({"msg": "Apercu d'analyse introuvable"}), 404

    return send_file(path, mimetype=mimetype or "image/jpeg")


@owner_workflow_bp.route("/ai-sources/<int:source_id>/calibration-frame", methods=["GET"])
@jwt_required()
def get_ai_source_calibration_frame(source_id):
    user, error_response = _get_owner_user()
    if error_response:
        return error_response
    approval_error = _ensure_owner_approved(user)
    if approval_error:
        return approval_error

    source = ParkingAISource.query.get(source_id)
    if not source:
        return jsonify({"msg": "Source IA introuvable"}), 404

    parking = _get_owner_parking(user, source.parking_id)
    if not parking:
        return jsonify({"msg": "Acces non autorise"}), 403

    try:
        path, mimetype = _get_ai_source_service().extract_calibration_frame(source)
    except Exception as exc:
        return jsonify({"msg": str(exc)}), 500

    if not path:
        return jsonify({"msg": "Capture de calibration introuvable"}), 404

    return send_file(path, mimetype=mimetype or "image/jpeg")

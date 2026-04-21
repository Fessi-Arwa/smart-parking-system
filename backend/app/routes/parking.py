from flask import Blueprint, jsonify, request
from flask_jwt_extended import get_jwt_identity, jwt_required, verify_jwt_in_request
from sqlalchemy import func, or_

from .. import db
from ..models.compte import Compte, RoleCompte, StatutValidationOwner
from ..models.parking import (
    Parking,
    StatutConfigurationIA,
    StatutConfigurationParking,
    StatutParking,
    StatutValidationParking,
)


parking_bp = Blueprint("parking", __name__)


def _get_current_user_optional():
    try:
        verify_jwt_in_request(optional=True)
        user_id = get_jwt_identity()
        if user_id is None:
            return None
        return Compte.query.get(int(user_id))
    except Exception:
        return None


def _normalize_text(value):
    return str(value or "").strip()


def _find_owner_duplicate_parking(owner_id, nom, adresse, exclude_id=None):
    normalized_nom = _normalize_text(nom).lower()
    normalized_adresse = _normalize_text(adresse).lower()
    if not normalized_nom or not normalized_adresse:
        return None

    query = Parking.query.filter(
        Parking.owner_id == owner_id,
        func.lower(Parking.nom) == normalized_nom,
        func.lower(Parking.adresse) == normalized_adresse,
    )
    if exclude_id is not None:
        query = query.filter(Parking.id_park != exclude_id)
    return query.first()


@parking_bp.route("/", methods=["GET"])
def get_all():
    current_user = _get_current_user_optional()
    query = Parking.query

    if not current_user or current_user.role == RoleCompte.conducteur:
        query = query.filter(
            Parking.validation_status == StatutValidationParking.valide,
            Parking.statut == "actif",
        )
    elif current_user.role == RoleCompte.owner:
        query = query.filter(
            or_(
                Parking.owner_id == current_user.id_compte,
                (
                    (Parking.validation_status == StatutValidationParking.valide)
                    & (Parking.statut == "actif")
                ),
            )
        )

    parkings = query.order_by(Parking.id_park.asc()).all()
    return jsonify([parking.to_dict() for parking in parkings])


@parking_bp.route("/", methods=["POST"])
@jwt_required()
def create_parking():
    data = request.get_json() or {}
    user_id = get_jwt_identity()
    user = Compte.query.get(int(user_id))

    if not user:
        return jsonify({"msg": "Utilisateur introuvable"}), 404

    if user.role != RoleCompte.owner:
        return jsonify({"msg": "Seuls les owners peuvent ajouter un parking"}), 403

    if user.owner_status != StatutValidationOwner.accepte:
        return jsonify({"msg": "Le compte owner doit etre accepte avant de creer un parking"}), 403

    nom = _normalize_text(data.get("nom"))
    adresse = _normalize_text(data.get("adresse"))
    required_fields = {
        "nom": nom,
        "adresse": adresse,
        "capacite": data.get("capacite"),
        "prix_heure": data.get("prix_heure"),
    }
    missing_fields = [field for field, value in required_fields.items() if value in (None, "")]
    if missing_fields:
        return jsonify({"msg": "nom, adresse, capacite et prix_heure sont obligatoires"}), 400

    try:
        capacite = int(data["capacite"])
        prix_heure = float(data["prix_heure"])
    except (TypeError, ValueError):
        return jsonify({"msg": "capacite et prix_heure doivent etre numeriques"}), 400

    raw_statut = _normalize_text(data.get("statut")) or StatutParking.actif.value
    try:
        statut = StatutParking(raw_statut)
    except ValueError:
        return jsonify({"msg": "statut invalide"}), 400

    if capacite <= 0 or prix_heure < 0:
        return jsonify({"msg": "capacite doit etre superieure a 0 et prix_heure doit etre positif"}), 400

    duplicate = _find_owner_duplicate_parking(user.id_compte, nom, adresse)
    if duplicate:
        return jsonify({"msg": "Un parking avec le meme nom et la meme adresse existe deja pour ce owner"}), 400

    parking = Parking(
        owner_id=user.id_compte,
        nom=nom,
        adresse=adresse,
        capacite=capacite,
        prix_heure=prix_heure,
        statut=statut,
        validation_status=StatutValidationParking.en_attente_validation,
        setup_status=StatutConfigurationParking.non_commencee,
        ai_setup_status=StatutConfigurationIA.non_configuree,
    )

    db.session.add(parking)
    db.session.commit()

    return jsonify({"msg": "Parking cree avec succes", "parking": parking.to_dict()}), 201


@parking_bp.route("/<int:parking_id>", methods=["GET"])
def get_parking(parking_id):
    parking = Parking.query.get(parking_id)
    if not parking:
        return jsonify({"msg": "Parking introuvable"}), 404

    current_user = _get_current_user_optional()
    if (
        parking.validation_status != StatutValidationParking.valide
        or parking.statut != "actif"
    ):
        if not current_user:
            return jsonify({"msg": "Parking introuvable"}), 404
        if current_user.role != RoleCompte.admin and parking.owner_id != current_user.id_compte:
            return jsonify({"msg": "Parking introuvable"}), 404

    return jsonify(parking.to_dict()), 200


@parking_bp.route("/<int:parking_id>", methods=["PUT"])
@jwt_required()
def update_parking(parking_id):
    parking = Parking.query.get(parking_id)
    if not parking:
        return jsonify({"msg": "Parking introuvable"}), 404

    user_id = get_jwt_identity()
    user = Compte.query.get(int(user_id))

    if not user:
        return jsonify({"msg": "Utilisateur introuvable"}), 404

    if parking.owner_id != user.id_compte:
        return jsonify({"msg": "Seuls les owners peuvent modifier leur parking"}), 403

    data = request.get_json() or {}
    tracked_fields = ("nom", "adresse", "capacite", "prix_heure", "statut")
    changed_structural_fields = False
    next_values = {
        "nom": parking.nom,
        "adresse": parking.adresse,
        "capacite": parking.capacite,
        "prix_heure": float(parking.prix_heure),
        "statut": parking.statut,
    }

    for field in tracked_fields:
        if field not in data:
            continue

        value = data[field]
        if field in {"nom", "adresse"}:
            value = _normalize_text(value)
            if not value:
                return jsonify({"msg": f"{field} ne peut pas etre vide"}), 400
        elif field == "capacite":
            try:
                value = int(value)
            except (TypeError, ValueError):
                return jsonify({"msg": "capacite doit etre numerique"}), 400
            if value <= 0:
                return jsonify({"msg": "capacite doit etre superieure a 0"}), 400
        elif field == "prix_heure":
            try:
                value = float(value)
            except (TypeError, ValueError):
                return jsonify({"msg": "prix_heure doit etre numerique"}), 400
            if value < 0:
                return jsonify({"msg": "prix_heure doit etre positif"}), 400
        elif field == "statut":
            try:
                value = StatutParking(_normalize_text(value))
            except ValueError:
                return jsonify({"msg": "statut invalide"}), 400

        if getattr(parking, field) != value:
            changed_structural_fields = True
            setattr(parking, field, value)
        next_values[field] = value

    duplicate = _find_owner_duplicate_parking(
        user.id_compte,
        next_values["nom"],
        next_values["adresse"],
        exclude_id=parking.id_park,
    )
    if duplicate:
        return jsonify({"msg": "Un autre parking avec le meme nom et la meme adresse existe deja"}), 400

    if changed_structural_fields:
        # Keep the workflow stable while the owner is still inside the dedicated
        # parking-setup step. Otherwise every edit would send the parking back to
        # admin review before step 3 can be completed.
        is_setup_in_progress = (
            parking.validation_status == StatutValidationParking.valide
            and parking.setup_status != StatutConfigurationParking.terminee
        )

        if not is_setup_in_progress:
            parking.validation_status = StatutValidationParking.en_attente_validation
            parking.setup_status = StatutConfigurationParking.non_commencee
            parking.ai_setup_status = StatutConfigurationIA.non_configuree

    db.session.commit()
    return jsonify({"msg": "Parking mis a jour avec succes", "parking": parking.to_dict()}), 200


@parking_bp.route("/<int:parking_id>", methods=["DELETE"])
@jwt_required()
def delete_parking(parking_id):
    parking = Parking.query.get(parking_id)
    if not parking:
        return jsonify({"msg": "Parking introuvable"}), 404

    user_id = get_jwt_identity()
    user = Compte.query.get(int(user_id))

    if not user:
        return jsonify({"msg": "Utilisateur introuvable"}), 404

    if parking.owner_id != user.id_compte:
        return jsonify({"msg": "Seuls les owners peuvent supprimer leur parking"}), 403

    db.session.delete(parking)
    db.session.commit()
    return jsonify({"msg": "Parking supprime avec succes"}), 200

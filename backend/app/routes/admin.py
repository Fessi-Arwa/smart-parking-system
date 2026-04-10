from flask import Blueprint, jsonify, request
from flask_jwt_extended import get_jwt_identity, jwt_required

from .. import db
from ..models.abonnement import Abonnement, StatutAbonnement
from ..models.abonnement_app import AbonnementApp
from ..models.compte import Compte, RoleCompte, StatutValidationOwner
from ..models.feedback import Feedback
from ..models.paiement import Paiement
from ..models.parking import Parking, StatutConfigurationIA, StatutConfigurationParking, StatutValidationParking
from ..models.place import Place
from ..models.reservation import Reservation


admin_bp = Blueprint("admin", __name__)


def _require_admin():
    user_id = get_jwt_identity()
    user = Compte.query.get(int(user_id))

    if not user:
        return None, (jsonify({"msg": "Utilisateur introuvable"}), 404)

    if user.role != RoleCompte.admin:
        return None, (jsonify({"msg": "Acces reserve aux admins"}), 403)

    return user, None


def _parking_to_admin_dict(parking):
    owner = Compte.query.get(parking.owner_id)
    data = parking.to_dict()
    data["owner_name"] = owner.nom if owner else f"Owner #{parking.owner_id}"
    data["owner_status"] = owner.owner_status.value if owner and owner.owner_status else None
    return data


@admin_bp.route("/stats", methods=["GET"])
@jwt_required()
def get_stats():
    _, error_response = _require_admin()
    if error_response:
        return error_response

    return jsonify(
        {
            "comptes": Compte.query.count(),
            "parkings": Parking.query.count(),
            "places": Place.query.count(),
            "reservations": Reservation.query.count(),
            "paiements": Paiement.query.count(),
            "feedbacks": Feedback.query.count(),
            "places_libres": Place.query.filter(Place.etat == "libre").count(),
            "places_occupees": Place.query.filter(Place.etat == "occupee").count(),
            "places_reservees": Place.query.filter(Place.etat == "reservee").count(),
        }
    )


@admin_bp.route("/users", methods=["GET"])
@jwt_required()
def get_users():
    _, error_response = _require_admin()
    if error_response:
        return error_response

    comptes = Compte.query.order_by(Compte.id_compte.asc()).all()
    return jsonify([compte.to_dict() for compte in comptes])


@admin_bp.route("/users/<int:user_id>", methods=["GET"])
@jwt_required()
def get_user(user_id):
    _, error_response = _require_admin()
    if error_response:
        return error_response

    compte = Compte.query.get(user_id)
    if not compte:
        return jsonify({"error": "User not found"}), 404
    return jsonify(compte.to_dict())


@admin_bp.route("/users/<int:user_id>", methods=["PUT"])
@jwt_required()
def update_user(user_id):
    _, error_response = _require_admin()
    if error_response:
        return error_response

    compte = Compte.query.get(user_id)
    if not compte:
        return jsonify({"error": "User not found"}), 404

    data = request.get_json() or {}
    compte.update_from_dict(data, ("nom", "email", "telephone", "role"))

    db.session.commit()
    return jsonify(compte.to_dict())


@admin_bp.route("/users/<int:user_id>", methods=["DELETE"])
@jwt_required()
def delete_user(user_id):
    _, error_response = _require_admin()
    if error_response:
        return error_response

    compte = Compte.query.get(user_id)
    if not compte:
        return jsonify({"error": "User not found"}), 404

    db.session.delete(compte)
    db.session.commit()
    return jsonify({"msg": "User deleted"})


@admin_bp.route("/parkings", methods=["GET"])
@jwt_required()
def get_parkings():
    _, error_response = _require_admin()
    if error_response:
        return error_response

    parkings = Parking.query.order_by(Parking.id_park.asc()).all()
    return jsonify([_parking_to_admin_dict(parking) for parking in parkings])


@admin_bp.route("/parkings/<int:parking_id>", methods=["PUT"])
@jwt_required()
def update_parking(parking_id):
    _, error_response = _require_admin()
    if error_response:
        return error_response

    parking = Parking.query.get(parking_id)
    if not parking:
        return jsonify({"error": "Parking not found"}), 404

    data = request.get_json() or {}
    parking.update_from_dict(
        data,
        ("nom", "adresse", "capacite", "prix_heure", "statut"),
    )

    db.session.commit()
    return jsonify(_parking_to_admin_dict(parking))


@admin_bp.route("/parkings/<int:parking_id>", methods=["DELETE"])
@jwt_required()
def delete_parking(parking_id):
    _, error_response = _require_admin()
    if error_response:
        return error_response

    parking = Parking.query.get(parking_id)
    if not parking:
        return jsonify({"error": "Parking not found"}), 404

    db.session.delete(parking)
    db.session.commit()
    return jsonify({"msg": "Parking deleted"})


@admin_bp.route("/owners/<int:user_id>/status", methods=["PUT"])
@jwt_required()
def update_owner_status(user_id):
    _, error_response = _require_admin()
    if error_response:
        return error_response

    compte = Compte.query.get(user_id)
    if not compte:
        return jsonify({"msg": "Utilisateur introuvable"}), 404

    if compte.role != RoleCompte.owner:
        return jsonify({"msg": "Ce compte n est pas un owner"}), 400

    data = request.get_json() or {}
    status = data.get("owner_status")

    try:
        compte.owner_status = StatutValidationOwner(status)
    except ValueError:
        return jsonify({"msg": "owner_status invalide"}), 400

    db.session.commit()
    return jsonify(compte.to_dict()), 200


@admin_bp.route("/parkings/<int:parking_id>/validation-status", methods=["PUT"])
@jwt_required()
def update_parking_validation_status(parking_id):
    _, error_response = _require_admin()
    if error_response:
        return error_response

    parking = Parking.query.get(parking_id)
    if not parking:
        return jsonify({"msg": "Parking introuvable"}), 404

    data = request.get_json() or {}
    status = data.get("validation_status")

    try:
        next_status = StatutValidationParking(status)
    except ValueError:
        return jsonify({"msg": "validation_status invalide"}), 400

    owner = Compte.query.get(parking.owner_id)
    if not owner or owner.role != RoleCompte.owner:
        return jsonify({"msg": "Owner du parking introuvable"}), 404

    if next_status == StatutValidationParking.valide and owner.owner_status != StatutValidationOwner.accepte:
        return jsonify({"msg": "Le compte owner doit etre accepte avant de valider son parking"}), 400

    parking.validation_status = next_status
    if next_status != StatutValidationParking.valide:
        parking.setup_status = StatutConfigurationParking.non_commencee
        parking.ai_setup_status = StatutConfigurationIA.non_configuree

    db.session.commit()
    return jsonify(_parking_to_admin_dict(parking)), 200



@admin_bp.route("/app-subscriptions", methods=["GET"])
@jwt_required()
def get_app_subscriptions():
    _, error_response = _require_admin()
    if error_response:
        return error_response

    links = AbonnementApp.query.order_by(AbonnementApp.id_abon.desc()).all()
    abonnement_ids = [link.id_abon for link in links]
    parking_ids = [link.parking_id for link in links]

    abonnements = {
        abonnement.id_abon: abonnement
        for abonnement in Abonnement.query.filter(Abonnement.id_abon.in_(abonnement_ids)).all()
    } if abonnement_ids else {}
    parkings = {
        parking.id_park: parking
        for parking in Parking.query.filter(Parking.id_park.in_(parking_ids)).all()
    } if parking_ids else {}
    owner_ids = [parking.owner_id for parking in parkings.values()]
    owners = {
        owner.id_compte: owner
        for owner in Compte.query.filter(Compte.id_compte.in_(owner_ids)).all()
    } if owner_ids else {}

    data = []
    for link in links:
        abonnement = abonnements.get(link.id_abon)
        parking = parkings.get(link.parking_id)
        owner = owners.get(parking.owner_id) if parking else None

        if not abonnement:
            continue

        data.append(
            {
                **abonnement.to_dict(),
                "parking_id": link.parking_id,
                "parking": parking.to_dict() if parking else None,
                "owner": owner.to_dict() if owner else None,
            }
        )

    return jsonify(data), 200


@admin_bp.route("/app-subscriptions/<int:abonnement_id>/status", methods=["PUT"])
@jwt_required()
def update_app_subscription_status(abonnement_id):
    _, error_response = _require_admin()
    if error_response:
        return error_response

    abonnement = Abonnement.query.get(abonnement_id)
    if not abonnement:
        return jsonify({"msg": "Abonnement introuvable"}), 404

    data = request.get_json() or {}
    status = data.get("statut")

    try:
        abonnement.statut = StatutAbonnement(status)
    except ValueError:
        return jsonify({"msg": "statut d abonnement invalide"}), 400

    db.session.commit()
    return jsonify(abonnement.to_dict()), 200

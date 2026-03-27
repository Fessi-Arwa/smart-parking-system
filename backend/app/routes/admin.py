from flask import Blueprint, jsonify, request
from flask_jwt_extended import get_jwt_identity, jwt_required

from .. import db
from ..models.compte import Compte, RoleCompte, StatutValidationOwner
from ..models.feedback import Feedback
from ..models.paiement import Paiement
from ..models.parking import Parking, StatutValidationParking
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
    return jsonify([parking.to_dict() for parking in parkings])


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
    return jsonify(parking.to_dict())


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
        parking.validation_status = StatutValidationParking(status)
    except ValueError:
        return jsonify({"msg": "validation_status invalide"}), 400

    db.session.commit()
    return jsonify(parking.to_dict()), 200

from flask import Blueprint, jsonify, request

from .. import db
from ..models.compte import Compte
from ..models.feedback import Feedback
from ..models.paiement import Paiement
from ..models.parking import Parking
from ..models.place import Place
from ..models.reservation import Reservation


admin_bp = Blueprint("admin", __name__)


@admin_bp.route("/stats", methods=["GET"])
def get_stats():
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
def get_users():
    comptes = Compte.query.order_by(Compte.id_compte.asc()).all()
    return jsonify([compte.to_dict() for compte in comptes])


@admin_bp.route("/users/<int:user_id>", methods=["GET"])
def get_user(user_id):
    compte = Compte.query.get(user_id)
    if not compte:
        return jsonify({"error": "User not found"}), 404
    return jsonify(compte.to_dict())


@admin_bp.route("/users/<int:user_id>", methods=["PUT"])
def update_user(user_id):
    compte = Compte.query.get(user_id)
    if not compte:
        return jsonify({"error": "User not found"}), 404

    data = request.get_json() or {}
    compte.update_from_dict(data, ("nom", "email", "telephone", "role"))

    db.session.commit()
    return jsonify(compte.to_dict())


@admin_bp.route("/users/<int:user_id>", methods=["DELETE"])
def delete_user(user_id):
    compte = Compte.query.get(user_id)
    if not compte:
        return jsonify({"error": "User not found"}), 404

    db.session.delete(compte)
    db.session.commit()
    return jsonify({"msg": "User deleted"})


@admin_bp.route("/parkings", methods=["GET"])
def get_parkings():
    parkings = Parking.query.order_by(Parking.id_park.asc()).all()
    return jsonify([parking.to_dict() for parking in parkings])


@admin_bp.route("/parkings/<int:parking_id>", methods=["PUT"])
def update_parking(parking_id):
    parking = Parking.query.get(parking_id)
    if not parking:
        return jsonify({"error": "Parking not found"}), 404

    data = request.get_json() or {}
    parking.update_from_dict(
        data,
        ("nom", "adresse", "ville", "latitude", "longitude", "prix_heure", "statut"),
    )

    db.session.commit()
    return jsonify(parking.to_dict())


@admin_bp.route("/parkings/<int:parking_id>", methods=["DELETE"])
def delete_parking(parking_id):
    parking = Parking.query.get(parking_id)
    if not parking:
        return jsonify({"error": "Parking not found"}), 404

    db.session.delete(parking)
    db.session.commit()
    return jsonify({"msg": "Parking deleted"})

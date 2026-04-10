from flask import Blueprint, jsonify, request
from flask_jwt_extended import get_jwt_identity, jwt_required

from .. import db
from ..models.compte import Compte, RoleCompte
from ..models.parking import Parking, StatutValidationParking
from ..models.place import Place


place_bp = Blueprint("place", __name__)


def _get_actor():
    user_id = get_jwt_identity()
    if user_id is None:
        return None
    return Compte.query.get(int(user_id))


def _can_manage_parking(user, parking):
    if not user or not parking:
        return False
    return user.role == RoleCompte.admin or parking.owner_id == user.id_compte


def _ensure_parking_validated(parking):
    if not parking:
        return jsonify({"error": "Parking not found"}), 404
    if parking.validation_status != StatutValidationParking.valide:
        return jsonify({"error": "Le parking doit etre valide avant de manipuler ses places"}), 400
    return None


@place_bp.route("/", methods=["GET"])
def get_places():
    query = Place.query

    parking_id = request.args.get("parking_id", type=int)
    etat = request.args.get("etat")

    if parking_id is not None:
        query = query.filter(Place.parking_id == parking_id)
    if etat:
        query = query.filter(Place.etat == etat)

    places = query.order_by(Place.id_place.asc()).all()
    return jsonify([place.to_dict() for place in places])


@place_bp.route("/<int:place_id>", methods=["GET"])
def get_place(place_id):
    place = Place.query.get(place_id)
    if not place:
        return jsonify({"error": "Place not found"}), 404
    return jsonify(place.to_dict())


@place_bp.route("/", methods=["POST"])
@jwt_required()
def create_place():
    data = request.get_json() or {}

    if data.get("parking_id") is None or data.get("num_place") is None:
        return jsonify({"error": "parking_id and num_place are required"}), 400

    parking = Parking.query.get(data["parking_id"])
    if not parking:
        return jsonify({"error": "Parking not found"}), 404
    validation_error = _ensure_parking_validated(parking)
    if validation_error:
        return validation_error

    user = _get_actor()
    if not user:
        return jsonify({"error": "User not found"}), 404

    if not _can_manage_parking(user, parking):
        return jsonify({"error": "Unauthorized to manage places for this parking"}), 403

    place = Place(
        parking_id=data["parking_id"],
        num_place=data["num_place"],
        etat=data.get("etat", "libre"),
        zone=data.get("zone"),
        etage=data.get("etage"),
    )

    db.session.add(place)
    db.session.commit()

    return jsonify(place.to_dict()), 201


@place_bp.route("/<int:place_id>", methods=["PUT"])
@jwt_required()
def update_place(place_id):
    place = Place.query.get(place_id)
    if not place:
        return jsonify({"error": "Place not found"}), 404

    parking = Parking.query.get(place.parking_id)
    validation_error = _ensure_parking_validated(parking)
    if validation_error:
        return validation_error
    user = _get_actor()

    if not user:
        return jsonify({"error": "User not found"}), 404

    if not _can_manage_parking(user, parking):
        return jsonify({"error": "Unauthorized to update this place"}), 403

    data = request.get_json() or {}

    place.update_from_dict(data, ("parking_id", "num_place", "etat", "zone", "etage"))

    db.session.commit()
    return jsonify(place.to_dict())


@place_bp.route("/<int:place_id>", methods=["DELETE"])
@jwt_required()
def delete_place(place_id):
    place = Place.query.get(place_id)
    if not place:
        return jsonify({"error": "Place not found"}), 404

    parking = Parking.query.get(place.parking_id)
    validation_error = _ensure_parking_validated(parking)
    if validation_error:
        return validation_error
    user = _get_actor()

    if not user:
        return jsonify({"error": "User not found"}), 404

    if not _can_manage_parking(user, parking):
        return jsonify({"error": "Unauthorized to delete this place"}), 403

    db.session.delete(place)
    db.session.commit()
    return jsonify({"msg": "Place deleted"})

from flask import Blueprint, jsonify, request

from .. import db
from ..models.place import Place


place_bp = Blueprint("place", __name__)


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
def create_place():
    data = request.get_json() or {}

    if data.get("parking_id") is None or data.get("num_place") is None:
        return jsonify({"error": "parking_id and num_place are required"}), 400

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
def update_place(place_id):
    place = Place.query.get(place_id)
    if not place:
        return jsonify({"error": "Place not found"}), 404

    data = request.get_json() or {}

    place.update_from_dict(data, ("parking_id", "num_place", "etat", "zone", "etage"))

    db.session.commit()
    return jsonify(place.to_dict())


@place_bp.route("/<int:place_id>", methods=["DELETE"])
def delete_place(place_id):
    place = Place.query.get(place_id)
    if not place:
        return jsonify({"error": "Place not found"}), 404

    db.session.delete(place)
    db.session.commit()
    return jsonify({"msg": "Place deleted"})

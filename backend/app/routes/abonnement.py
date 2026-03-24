from datetime import date
from flask import Blueprint, jsonify, request

from .. import db
from ..models.abonnement import Abonnement
from ..models.abonnement_app import AbonnementApp
from ..models.abonnement_place import AbonnementPlace


abonnement_bp = Blueprint("abonnement", __name__)


def _abonnement_to_dict(abonnement):
    data = abonnement.to_dict()
    data["categorie"] = "abonnement"

    abonnement_app = AbonnementApp.query.get(abonnement.id_abon)
    abonnement_place = AbonnementPlace.query.get(abonnement.id_abon)

    if abonnement_app:
        data["categorie"] = "abonnement_app"
        data["parking_id"] = abonnement_app.parking_id

    if abonnement_place:
        data["categorie"] = "abonnement_place"
        data["conducteur_id"] = abonnement_place.conducteur_id
        data["place_id"] = abonnement_place.place_id

    return data


def _parse_date(value):
    if value is None or isinstance(value, date):
        return value
    return date.fromisoformat(value)


def _build_abonnement(data):
    return Abonnement(
        type=data["type"],
        date_debut=_parse_date(data["date_debut"]),
        date_fin=_parse_date(data["date_fin"]),
        statut=data.get("statut", "en_attente"),
        tarif=data["tarif"],
    )


@abonnement_bp.route("/", methods=["GET"])
def get_abonnements():
    abonnements = Abonnement.query.order_by(Abonnement.id_abon.asc()).all()
    return jsonify([_abonnement_to_dict(abonnement) for abonnement in abonnements])


@abonnement_bp.route("/<int:abonnement_id>", methods=["GET"])
def get_abonnement(abonnement_id):
    abonnement = Abonnement.query.get(abonnement_id)
    if not abonnement:
        return jsonify({"error": "Abonnement not found"}), 404
    return jsonify(_abonnement_to_dict(abonnement))


@abonnement_bp.route("/app", methods=["POST"])
def create_abonnement_app():
    data = request.get_json() or {}
    required_fields = ("type", "date_debut", "date_fin", "tarif", "parking_id")

    if any(data.get(field) is None for field in required_fields):
        return jsonify({"error": "type, date_debut, date_fin, tarif and parking_id are required"}), 400

    abonnement = _build_abonnement(data)
    db.session.add(abonnement)
    db.session.flush()

    abonnement_app = AbonnementApp(
        id_abon=abonnement.id_abon,
        parking_id=data["parking_id"],
    )
    db.session.add(abonnement_app)
    db.session.commit()

    return jsonify(_abonnement_to_dict(abonnement)), 201


@abonnement_bp.route("/place", methods=["POST"])
def create_abonnement_place():
    data = request.get_json() or {}
    required_fields = ("type", "date_debut", "date_fin", "tarif", "conducteur_id", "place_id")

    if any(data.get(field) is None for field in required_fields):
        return jsonify(
            {"error": "type, date_debut, date_fin, tarif, conducteur_id and place_id are required"}
        ), 400

    abonnement = _build_abonnement(data)
    db.session.add(abonnement)
    db.session.flush()

    abonnement_place = AbonnementPlace(
        id_abon=abonnement.id_abon,
        conducteur_id=data["conducteur_id"],
        place_id=data["place_id"],
    )
    db.session.add(abonnement_place)
    db.session.commit()

    return jsonify(_abonnement_to_dict(abonnement)), 201


@abonnement_bp.route("/<int:abonnement_id>", methods=["PUT"])
def update_abonnement(abonnement_id):
    abonnement = Abonnement.query.get(abonnement_id)
    if not abonnement:
        return jsonify({"error": "Abonnement not found"}), 404

    data = request.get_json() or {}

    abonnement.update_from_dict(data, ("type", "statut", "tarif"))

    if "date_debut" in data:
        abonnement.date_debut = _parse_date(data["date_debut"])
    if "date_fin" in data:
        abonnement.date_fin = _parse_date(data["date_fin"])

    abonnement_app = AbonnementApp.query.get(abonnement_id)
    abonnement_place = AbonnementPlace.query.get(abonnement_id)

    if abonnement_app and "parking_id" in data:
        abonnement_app.parking_id = data["parking_id"]

    if abonnement_place:
        if "conducteur_id" in data:
            abonnement_place.conducteur_id = data["conducteur_id"]
        if "place_id" in data:
            abonnement_place.place_id = data["place_id"]

    db.session.commit()
    return jsonify(_abonnement_to_dict(abonnement))


@abonnement_bp.route("/<int:abonnement_id>", methods=["DELETE"])
def delete_abonnement(abonnement_id):
    abonnement = Abonnement.query.get(abonnement_id)
    if not abonnement:
        return jsonify({"error": "Abonnement not found"}), 404

    db.session.delete(abonnement)
    db.session.commit()
    return jsonify({"msg": "Abonnement deleted"})

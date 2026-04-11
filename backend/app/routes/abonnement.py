from datetime import date
from flask import Blueprint, jsonify, request
from flask_jwt_extended import get_jwt_identity, jwt_required

from .. import db
from ..models.abonnement import Abonnement
from ..models.abonnement_app import AbonnementApp
from ..models.abonnement_place import AbonnementPlace
from ..models.compte import Compte, RoleCompte
from ..models.parking import Parking
from ..models.place import Place
from ..models.place import StatutPlace


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
@jwt_required()
def get_abonnements():
    user_id = int(get_jwt_identity())
    abonnement_links = (
        AbonnementPlace.query.filter_by(conducteur_id=user_id)
        .order_by(AbonnementPlace.id_abon.desc())
        .all()
    )

    abonnement_ids = [link.id_abon for link in abonnement_links]
    place_ids = [link.place_id for link in abonnement_links]

    abonnements = {
        abonnement.id_abon: abonnement
        for abonnement in Abonnement.query.filter(Abonnement.id_abon.in_(abonnement_ids)).all()
    } if abonnement_ids else {}
    places = {
        place.id_place: place
        for place in Place.query.filter(Place.id_place.in_(place_ids)).all()
    } if place_ids else {}

    parking_ids = [place.parking_id for place in places.values() if place.parking_id is not None]
    parkings = {
        parking.id_park: parking
        for parking in Parking.query.filter(Parking.id_park.in_(parking_ids)).all()
    } if parking_ids else {}

    data = []
    for link in abonnement_links:
        abonnement = abonnements.get(link.id_abon)
        if not abonnement:
            continue

        item = _abonnement_to_dict(abonnement)
        place = places.get(link.place_id)
        parking = parkings.get(place.parking_id) if place else None

        item["place"] = place.to_dict() if place else None
        item["parking"] = parking.to_dict() if parking else None
        data.append(item)

    return jsonify(data)


@abonnement_bp.route("/owner", methods=["GET"])
@jwt_required()
def get_owner_abonnements():
    user_id = int(get_jwt_identity())
    user = Compte.query.get(user_id)

    if not user:
        return jsonify({"msg": "Utilisateur introuvable"}), 404

    if user.role != RoleCompte.owner:
        return jsonify({"msg": "Seuls les owners peuvent consulter ces abonnements"}), 403

    owner_parkings = Parking.query.filter_by(owner_id=user.id_compte).all()
    parking_ids = [parking.id_park for parking in owner_parkings]
    places = Place.query.filter(Place.parking_id.in_(parking_ids)).all() if parking_ids else []
    place_map = {place.id_place: place for place in places}
    parking_map = {parking.id_park: parking for parking in owner_parkings}
    place_ids = list(place_map.keys())

    abonnement_links = (
        AbonnementPlace.query.filter(AbonnementPlace.place_id.in_(place_ids))
        .order_by(AbonnementPlace.id_abon.desc())
        .all()
        if place_ids
        else []
    )
    abonnement_ids = [link.id_abon for link in abonnement_links]
    abonnements = {
        abonnement.id_abon: abonnement
        for abonnement in Abonnement.query.filter(Abonnement.id_abon.in_(abonnement_ids)).all()
    } if abonnement_ids else {}

    data = []
    for link in abonnement_links:
        abonnement = abonnements.get(link.id_abon)
        if not abonnement:
            continue

        item = _abonnement_to_dict(abonnement)
        place = place_map.get(link.place_id)
        parking = parking_map.get(place.parking_id) if place else None

        item["place"] = place.to_dict() if place else None
        item["parking"] = parking.to_dict() if parking else None
        data.append(item)

    return jsonify(data)


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
@jwt_required()
def create_abonnement_place():
    data = request.get_json() or {}
    user_id = int(get_jwt_identity())
    required_fields = ("type", "date_debut", "date_fin", "tarif", "place_id")

    if any(data.get(field) is None for field in required_fields):
        return jsonify(
            {"error": "type, date_debut, date_fin, tarif and place_id are required"}
        ), 400

    place = Place.query.get(data["place_id"])
    if not place:
        return jsonify({"error": "Place introuvable"}), 404

    if place.etat != StatutPlace.libre:
        return jsonify({"error": "Cette place n est plus disponible pour un abonnement"}), 400

    existing_link = AbonnementPlace.query.filter_by(place_id=place.id_place).first()
    if existing_link:
        return jsonify({"error": "Cette place a deja un abonnement"}), 400

    abonnement = _build_abonnement(data)
    db.session.add(abonnement)
    db.session.flush()

    abonnement_place = AbonnementPlace(
        id_abon=abonnement.id_abon,
        conducteur_id=user_id,
        place_id=data["place_id"],
    )
    db.session.add(abonnement_place)
    place.etat = StatutPlace.reservee
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

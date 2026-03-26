from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from ..controllers.reservation_controller import create_reservation
from ..models.compte import Compte, RoleCompte
from ..models.place import Place
from ..models.reservation import Reservation
from ..models.vehicule import Vehicule
from ..models.parking import Parking


reservation_bp = Blueprint("reservation", __name__)

@reservation_bp.route("/", methods=["GET"])
@jwt_required()
def list_reservations():
    user_id = int(get_jwt_identity())
    reservations = (
        Reservation.query.filter_by(conducteur_id=user_id)
        .order_by(Reservation.date_debut.desc(), Reservation.id_res.desc())
        .all()
    )

    place_ids = [reservation.place_id for reservation in reservations if reservation.place_id is not None]
    vehicle_ids = [reservation.vehicule_id for reservation in reservations if reservation.vehicule_id is not None]

    places = {
        place.id_place: place
        for place in Place.query.filter(Place.id_place.in_(place_ids)).all()
    } if place_ids else {}
    vehicle_map = {
        vehicle.id_veh: vehicle
        for vehicle in Vehicule.query.filter(Vehicule.id_veh.in_(vehicle_ids)).all()
    } if vehicle_ids else {}

    parking_ids = [place.parking_id for place in places.values() if place.parking_id is not None]
    parkings = {
        parking.id_park: parking
        for parking in Parking.query.filter(Parking.id_park.in_(parking_ids)).all()
    } if parking_ids else {}

    data = []
    for reservation in reservations:
        item = reservation.to_dict()
        place = places.get(reservation.place_id)
        vehicle = vehicle_map.get(reservation.vehicule_id)
        parking = parkings.get(place.parking_id) if place else None

        item["place"] = place.to_dict() if place else None
        item["vehicule"] = vehicle.to_dict() if vehicle else None
        item["parking"] = parking.to_dict() if parking else None
        data.append(item)

    return jsonify(data), 200


@reservation_bp.route("/owner", methods=["GET"])
@jwt_required()
def list_owner_reservations():
    user_id = int(get_jwt_identity())
    user = Compte.query.get(user_id)

    if not user:
        return jsonify({"msg": "Utilisateur introuvable"}), 404

    if user.role != RoleCompte.owner:
        return jsonify({"msg": "Seuls les owners peuvent consulter ces reservations"}), 403

    owner_parkings = Parking.query.filter_by(owner_id=user.id_compte).all()
    parking_ids = [parking.id_park for parking in owner_parkings]
    places = Place.query.filter(Place.parking_id.in_(parking_ids)).all() if parking_ids else []
    place_map = {place.id_place: place for place in places}
    place_ids = list(place_map.keys())

    reservations = (
        Reservation.query.filter(Reservation.place_id.in_(place_ids)).order_by(
            Reservation.date_debut.desc(), Reservation.id_res.desc()
        ).all()
        if place_ids
        else []
    )

    vehicle_ids = [reservation.vehicule_id for reservation in reservations if reservation.vehicule_id is not None]
    conducteur_ids = [reservation.conducteur_id for reservation in reservations if reservation.conducteur_id is not None]

    vehicle_map = {
        vehicle.id_veh: vehicle
        for vehicle in Vehicule.query.filter(Vehicule.id_veh.in_(vehicle_ids)).all()
    } if vehicle_ids else {}
    conducteur_map = {
        conducteur.id_compte: conducteur
        for conducteur in Compte.query.filter(Compte.id_compte.in_(conducteur_ids)).all()
    } if conducteur_ids else {}
    parking_map = {parking.id_park: parking for parking in owner_parkings}

    data = []
    for reservation in reservations:
        item = reservation.to_dict()
        place = place_map.get(reservation.place_id)
        vehicle = vehicle_map.get(reservation.vehicule_id)
        conducteur = conducteur_map.get(reservation.conducteur_id)
        parking = parking_map.get(place.parking_id) if place else None

        item["place"] = place.to_dict() if place else None
        item["vehicule"] = vehicle.to_dict() if vehicle else None
        item["parking"] = parking.to_dict() if parking else None
        item["conducteur"] = conducteur.to_dict() if conducteur else None
        data.append(item)

    return jsonify(data), 200


@reservation_bp.route("/", methods=["POST"])
@jwt_required()
def reserve():
    data = request.json
    user_id = int(get_jwt_identity())

    result, status = create_reservation(data, user_id)

    return jsonify(result), status

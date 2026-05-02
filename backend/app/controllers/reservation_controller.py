from datetime import datetime, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from flask import current_app
from sqlalchemy.exc import IntegrityError

from .. import db
from ..models.parking import Parking
from ..models.place import Place
from ..models.reservation import Reservation
from ..models.vehicule import Vehicule


def _resolve_app_timezone() -> ZoneInfo:
    timezone_name = current_app.config.get("APP_TIMEZONE", "Africa/Tunis")
    try:
        return ZoneInfo(timezone_name)
    except ZoneInfoNotFoundError:
        return ZoneInfo("UTC")


def _parse_reservation_datetime(raw_value: str) -> datetime:
    parsed = datetime.fromisoformat(raw_value)
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=_resolve_app_timezone())
    return parsed.astimezone(timezone.utc)


def create_reservation(data, user_id):
    data = data or {}
    place_id = data.get("place_id")
    date_debut_raw = data.get("date_debut")
    date_fin_raw = data.get("date_fin")
    vehicule_id = data.get("vehicule_id")

    if place_id is None or not date_debut_raw or not date_fin_raw:
        return {"error": "place_id, date_debut and date_fin are required"}, 400

    try:
        date_debut = _parse_reservation_datetime(date_debut_raw)
        date_fin = _parse_reservation_datetime(date_fin_raw)
    except (TypeError, ValueError):
        return {"error": "Invalid date format"}, 400

    if date_fin <= date_debut:
        return {"error": "Invalid dates"}, 400

    place = Place.query.get(place_id)
    if not place:
        return {"error": "Place not found"}, 404

    existing = Reservation.query.filter(
        Reservation.place_id == place_id,
        Reservation.statut != "annulee",
        Reservation.date_debut < date_fin,
        Reservation.date_fin > date_debut,
    ).first()
    if existing:
        return {"error": "Place already reserved in this period"}, 400

    parking = Parking.query.get(place.parking_id)
    if not parking or not parking.is_active():
        return {"error": "Parking not available"}, 400

    vehicule = None
    if vehicule_id not in (None, ""):
        vehicule = Vehicule.query.get(int(vehicule_id))
        if not vehicule:
            return {"error": "Vehicle not found"}, 404
        if vehicule.conducteur_id != user_id:
            return {"error": "Vehicle does not belong to the authenticated driver"}, 403

    duration_hours = (date_fin - date_debut).total_seconds() / 3600
    prix = parking.calculate_price(duration_hours)

    reservation = Reservation(
        conducteur_id=user_id,
        vehicule_id=vehicule.id_veh if vehicule else None,
        place_id=place_id,
        date_debut=date_debut,
        date_fin=date_fin,
        prix_total=prix,
    ).confirm()

    place.reserve()

    try:
        db.session.add(reservation)
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return {"error": "Unable to save reservation in database"}, 400

    return {
        "msg": "Reservation successful",
        "prix": prix,
        "reservation": reservation.to_dict(),
    }, 201

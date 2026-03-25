from datetime import datetime

from .. import db
from ..models.parking import Parking
from ..models.place import Place
from ..models.reservation import Reservation


def create_reservation(data, user_id):
    place_id = data["place_id"]
    date_debut = datetime.fromisoformat(data["date_debut"])
    date_fin = datetime.fromisoformat(data["date_fin"])

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

    duration_hours = (date_fin - date_debut).total_seconds() / 3600
    prix = parking.calculate_price(duration_hours)

    reservation = Reservation(
        conducteur_id=user_id,
        vehicule_id=data.get("vehicule_id"),
        place_id=place_id,
        date_debut=date_debut,
        date_fin=date_fin,
        prix_total=prix,
    ).confirm()

    place.reserve()

    db.session.add(reservation)
    db.session.commit()

    return {
        "msg": "Reservation successful",
        "prix": prix,
        "reservation": reservation.to_dict(),
    }, 201

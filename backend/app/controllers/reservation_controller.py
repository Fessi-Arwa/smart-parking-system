from ..models.reservation import Reservation
from ..models.place import Place
from .. import db
from datetime import datetime

def create_reservation(data, user_id):

    # 🔍 vérifier si place libre
    place = Place.query.get(data["place_id"])

    if not place:
        return {"error": "Place not found"}, 404

    if place.etat != "libre":
        return {"error": "Place not available"}, 400

    # 💰 calcul prix simple
    duree = (datetime.fromisoformat(data["date_fin"]) - datetime.fromisoformat(data["date_debut"])).seconds / 3600
    prix = duree * 2  # simple pour test

    # 📅 créer réservation
    reservation = Reservation(
        conducteur_id=user_id,
        place_id=data["place_id"],
        date_debut=data["date_debut"],
        date_fin=data["date_fin"],
        statut="confirmee",
        prix_total=prix
    )

    # 🔒 bloquer la place
    place.etat = "reservee"

    db.session.add(reservation)
    db.session.commit()

    return {"msg": "Reservation created", "prix": prix}, 201
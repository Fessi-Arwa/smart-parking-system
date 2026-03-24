from .. import db

class Reservation(db.Model):
    __tablename__ = "reservation"

    id_res = db.Column(db.BigInteger, primary_key=True)
    conducteur_id = db.Column(db.BigInteger)
    place_id = db.Column(db.BigInteger)
    date_debut = db.Column(db.DateTime)
    date_fin = db.Column(db.DateTime)
    statut = db.Column(db.String(20))
    prix_total = db.Column(db.Float)
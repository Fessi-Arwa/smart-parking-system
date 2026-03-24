from .. import db

class Abonnement(db.Model):
    __tablename__ = "abonnement"

    id_abon = db.Column(db.BigInteger, primary_key=True)
    type = db.Column(db.String(50))
    date_debut = db.Column(db.Date)
    date_fin = db.Column(db.Date)
    statut = db.Column(db.String(20))
    tarif = db.Column(db.Float)
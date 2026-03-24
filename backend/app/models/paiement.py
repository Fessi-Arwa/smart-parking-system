from .. import db

class Paiement(db.Model):
    __tablename__ = "paiement"

    id_paiement = db.Column(db.BigInteger, primary_key=True)
    reservation_id = db.Column(db.BigInteger)
    montant = db.Column(db.Float)
    statut = db.Column(db.String(20))
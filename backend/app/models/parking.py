from .. import db

class Parking(db.Model):
    __tablename__ = "parking"

    id_park = db.Column(db.BigInteger, primary_key=True)
    owner_id = db.Column(db.BigInteger, db.ForeignKey('comptes.id_compte'))
    nom = db.Column(db.String(150))
    adresse = db.Column(db.Text)
    ville = db.Column(db.String(100))
    latitude = db.Column(db.Float)
    longitude = db.Column(db.Float)
    prix_heure = db.Column(db.Float)
from .. import db

class Vehicule(db.Model):
    __tablename__ = "vehicule"

    id_veh = db.Column(db.BigInteger, primary_key=True)
    conducteur_id = db.Column(db.BigInteger, db.ForeignKey('comptes.id_compte'))
    matricule = db.Column(db.String(50), unique=True)
    marque = db.Column(db.String(100))
    type = db.Column(db.String(100)) 
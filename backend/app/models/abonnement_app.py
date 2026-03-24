from .. import db

class AbonnementApp(db.Model):
    __tablename__ = "abonnement_app"

    id_abon = db.Column(db.BigInteger, db.ForeignKey('abonnement.id_abon'), primary_key=True)
    parking_id = db.Column(db.BigInteger, db.ForeignKey('parking.id_park'))
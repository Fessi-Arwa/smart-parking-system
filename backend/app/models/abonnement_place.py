from .. import db

class AbonnementPlace(db.Model):
    __tablename__ = "abonnement_place"

    id_abon = db.Column(db.BigInteger, db.ForeignKey('abonnement.id_abon'), primary_key=True)
    conducteur_id = db.Column(db.BigInteger, db.ForeignKey('comptes.id_compte'))
    place_id = db.Column(db.BigInteger, db.ForeignKey('place.id_place'))
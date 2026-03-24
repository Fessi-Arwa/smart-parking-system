from .. import db

class Place(db.Model):
    __tablename__ = "place"

    id_place = db.Column(db.BigInteger, primary_key=True)
    parking_id = db.Column(db.BigInteger, db.ForeignKey('parking.id_park'))
    num_place = db.Column(db.Integer)
    etat = db.Column(db.String(20))
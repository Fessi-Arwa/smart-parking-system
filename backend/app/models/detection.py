from .. import db

# 🧠 Table principale
class DetectionIA(db.Model):
    __tablename__ = "detection_ia"

    id_detect = db.Column(db.BigInteger, primary_key=True)
    date_detect = db.Column(db.DateTime)
    image_src = db.Column(db.Text)


# 🅿️ Détection place
class DetectionPlace(db.Model):
    __tablename__ = "detection_place"

    id_detect = db.Column(db.BigInteger, db.ForeignKey('detection_ia.id_detect'), primary_key=True)
    place_id = db.Column(db.BigInteger, db.ForeignKey('place.id_place'))
    etat_detecte = db.Column(db.String(20))


# 🚗 Détection véhicule
class DetectionVehicule(db.Model):
    __tablename__ = "detection_vehicule"

    id_detect = db.Column(db.BigInteger, db.ForeignKey('detection_ia.id_detect'), primary_key=True)
    parking_id = db.Column(db.BigInteger, db.ForeignKey('parking.id_park'))
    vehicule_id = db.Column(db.BigInteger, db.ForeignKey('vehicule.id_veh'))
    mat_detect = db.Column(db.String(50))
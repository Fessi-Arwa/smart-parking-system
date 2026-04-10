import enum

from sqlalchemy import Index
from sqlalchemy.sql import func

from .. import db
from .base import ModelMixin


class EtatPlaceDetecte(str, enum.Enum):
    libre = "libre"
    occupee = "occupee"


class DetectionIA(ModelMixin, db.Model):
    __tablename__ = "detection_ia"
    __public_fields__ = (
        "id_detect",
        "date_detect",
        "image_src",
        "created_at",
    )

    id_detect = db.Column(db.BigInteger, primary_key=True, autoincrement=True)
    date_detect = db.Column(db.DateTime(timezone=True), nullable=False, server_default=func.now())
    image_src = db.Column(db.Text)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, server_default=func.now())


class DetectionPlace(ModelMixin, db.Model):
    __tablename__ = "detection_place"
    __public_fields__ = ("id_detect", "place_id", "etat_detecte")
    __table_args__ = (Index("idx_detection_place_place_id", "place_id"),)

    id_detect = db.Column(
        db.BigInteger,
        db.ForeignKey("detection_ia.id_detect", ondelete="CASCADE"),
        primary_key=True,
    )
    place_id = db.Column(
        db.BigInteger,
        db.ForeignKey("place.id_place", ondelete="CASCADE"),
        nullable=False,
    )
    etat_detecte = db.Column(
        db.Enum(EtatPlaceDetecte, name="etat_place_detecte"),
        nullable=False,
    )


class DetectionVehicule(ModelMixin, db.Model):
    __tablename__ = "detection_vehicule"
    __public_fields__ = ("id_detect", "parking_id", "vehicule_id", "mat_detect")
    __table_args__ = (
        Index("idx_detection_vehicule_parking_id", "parking_id"),
        Index("idx_detection_vehicule_vehicule_id", "vehicule_id"),
    )

    id_detect = db.Column(
        db.BigInteger,
        db.ForeignKey("detection_ia.id_detect", ondelete="CASCADE"),
        primary_key=True,
    )
    parking_id = db.Column(db.BigInteger, db.ForeignKey("parking.id_park", ondelete="SET NULL"))
    vehicule_id = db.Column(db.BigInteger, db.ForeignKey("vehicule.id_veh", ondelete="SET NULL"))
    mat_detect = db.Column(db.String(50))

import enum

from sqlalchemy import Index, UniqueConstraint
from sqlalchemy.sql import func

from .. import db
from .base import ModelMixin


class StatutPlace(str, enum.Enum):
    libre = "libre"
    occupee = "occupee"
    reservee = "reservee"


class Place(ModelMixin, db.Model):
    __tablename__ = "place"
    __public_fields__ = (
        "id_place",
        "parking_id",
        "etage_id",
        "num_place",
        "etat",
        "zone",
        "etage",
        "created_at",
    )
    __table_args__ = (
        UniqueConstraint("parking_id", "num_place", name="uq_place_parking_num_place"),
        Index("idx_place_parking_id", "parking_id"),
    )

    id_place = db.Column(db.BigInteger, primary_key=True, autoincrement=True)
    parking_id = db.Column(
        db.BigInteger,
        db.ForeignKey("parking.id_park", ondelete="CASCADE"),
        nullable=False,
    )
    etage_id = db.Column(
        db.BigInteger,
        db.ForeignKey("etage.id_etage", ondelete="SET NULL"),
        nullable=True,
    )
    num_place = db.Column(db.Integer, nullable=False)
    etat = db.Column(
        db.Enum(StatutPlace, name="statut_place"),
        nullable=False,
        server_default=StatutPlace.libre.value,
    )
    zone = db.Column(db.String(100))
    etage = db.Column(db.String(50))
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, server_default=func.now())

    def is_available(self):
        return self.etat == StatutPlace.libre

    def reserve(self):
        self.etat = StatutPlace.reservee
        return self

    def occupy(self):
        self.etat = StatutPlace.occupee
        return self

    def release(self):
        self.etat = StatutPlace.libre
        return self

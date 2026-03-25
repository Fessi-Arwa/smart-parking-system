import enum

from sqlalchemy import CheckConstraint, Index
from sqlalchemy.sql import func

from .. import db
from .base import ModelMixin


class StatutParking(str, enum.Enum):
    actif = "actif"
    inactif = "inactif"


class Parking(ModelMixin, db.Model):
    __tablename__ = "parking"
    __public_fields__ = (
        "id_park",
        "owner_id",
        "nom",
        "adresse",
        "ville",
        "latitude",
        "longitude",
        "prix_heure",
        "statut",
        "created_at",
    )
    __table_args__ = (
        CheckConstraint("prix_heure >= 0", name="ck_parking_prix_heure_positive"),
        Index("idx_parking_owner_id", "owner_id"),
    )

    id_park = db.Column(db.BigInteger, primary_key=True)
    owner_id = db.Column(
        db.BigInteger,
        db.ForeignKey("comptes.id_compte", ondelete="CASCADE"),
        nullable=False,
    )
    nom = db.Column(db.String(150), nullable=False)
    adresse = db.Column(db.Text, nullable=False)
    ville = db.Column(db.String(100), nullable=False)
    latitude = db.Column(db.Float, nullable=False)
    longitude = db.Column(db.Float, nullable=False)
    prix_heure = db.Column(db.Numeric(10, 2), nullable=False)
    statut = db.Column(
        db.Enum(StatutParking, name="statut_parking"),
        nullable=False,
        server_default=StatutParking.actif.value,
    )
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, server_default=func.now())

    def is_active(self):
        return self.statut == StatutParking.actif

    def calculate_price(self, duration_hours):
        return round(float(self.prix_heure) * float(duration_hours), 2)

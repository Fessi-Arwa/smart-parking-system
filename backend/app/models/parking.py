import enum

from sqlalchemy import CheckConstraint, Index
from sqlalchemy.sql import func

from .. import db
from .base import ModelMixin


class StatutParking(str, enum.Enum):
    actif = "actif"
    inactif = "inactif"


class StatutValidationParking(str, enum.Enum):
    brouillon = "brouillon"
    en_attente_validation = "en_attente_validation"
    valide = "valide"
    rejete = "rejete"


class StatutConfigurationParking(str, enum.Enum):
    non_commencee = "non_commencee"
    en_cours = "en_cours"
    terminee = "terminee"


class StatutConfigurationIA(str, enum.Enum):
    non_configuree = "non_configuree"
    en_cours = "en_cours"
    testee = "testee"
    active = "active"


class Parking(ModelMixin, db.Model):
    __tablename__ = "parking"
    __public_fields__ = (
        "id_park",
        "owner_id",
        "nom",
        "adresse",
        "capacite",
        "prix_heure",
        "statut",
        "validation_status",
        "setup_status",
        "ai_setup_status",
        "created_at",
    )
    __table_args__ = (
        CheckConstraint("prix_heure >= 0", name="ck_parking_prix_heure_positive"),
        CheckConstraint("capacite >= 0", name="ck_parking_capacite_positive"),
        Index("idx_parking_owner_id", "owner_id"),
    )

    id_park = db.Column(db.BigInteger, primary_key=True, autoincrement=True)
    owner_id = db.Column(
        db.BigInteger,
        db.ForeignKey("comptes.id_compte", ondelete="CASCADE"),
        nullable=False,
    )
    nom = db.Column(db.String(150), nullable=False)
    adresse = db.Column(db.Text, nullable=False)
    capacite = db.Column(db.Integer, nullable=False)
    prix_heure = db.Column(db.Numeric(10, 2), nullable=False)
    statut = db.Column(
        db.Enum(StatutParking, name="statut_parking"),
        nullable=False,
        server_default=StatutParking.actif.value,
    )
    validation_status = db.Column(
        db.Enum(StatutValidationParking, name="statut_validation_parking"),
        nullable=False,
        server_default=StatutValidationParking.brouillon.value,
    )
    setup_status = db.Column(
        db.Enum(StatutConfigurationParking, name="statut_configuration_parking"),
        nullable=False,
        server_default=StatutConfigurationParking.non_commencee.value,
    )
    ai_setup_status = db.Column(
        db.Enum(StatutConfigurationIA, name="statut_configuration_ia"),
        nullable=False,
        server_default=StatutConfigurationIA.non_configuree.value,
    )
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, server_default=func.now())

    def is_active(self):
        return self.statut == StatutParking.actif

    def calculate_price(self, duration_hours):
        return round(float(self.prix_heure) * float(duration_hours), 2)

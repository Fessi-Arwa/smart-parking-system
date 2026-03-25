import enum

from sqlalchemy import CheckConstraint, Index
from sqlalchemy.sql import func

from .. import db
from .base import ModelMixin


class StatutReservation(str, enum.Enum):
    en_attente = "en_attente"
    confirmee = "confirmee"
    annulee = "annulee"
    terminee = "terminee"


class Reservation(ModelMixin, db.Model):
    __tablename__ = "reservation"
    __public_fields__ = (
        "id_res",
        "conducteur_id",
        "vehicule_id",
        "place_id",
        "date_debut",
        "date_fin",
        "statut",
        "prix_total",
        "created_at",
    )
    __table_args__ = (
        CheckConstraint("prix_total >= 0", name="ck_reservation_prix_total_positive"),
        CheckConstraint("date_fin > date_debut", name="ck_reservation_date_fin_gt_date_debut"),
        Index("idx_reservation_conducteur_id", "conducteur_id"),
        Index("idx_reservation_place_id", "place_id"),
        Index("idx_reservation_vehicule_id", "vehicule_id"),
    )

    id_res = db.Column(db.BigInteger, primary_key=True)
    conducteur_id = db.Column(
        db.BigInteger,
        db.ForeignKey("comptes.id_compte", ondelete="CASCADE"),
        nullable=False,
    )
    vehicule_id = db.Column(db.BigInteger, db.ForeignKey("vehicule.id_veh", ondelete="SET NULL"))
    place_id = db.Column(
        db.BigInteger,
        db.ForeignKey("place.id_place", ondelete="RESTRICT"),
        nullable=False,
    )
    date_debut = db.Column(db.DateTime(timezone=True), nullable=False)
    date_fin = db.Column(db.DateTime(timezone=True), nullable=False)
    statut = db.Column(
        db.Enum(StatutReservation, name="statut_reservation"),
        nullable=False,
        server_default=StatutReservation.en_attente.value,
    )
    prix_total = db.Column(db.Numeric(10, 2), nullable=False, server_default="0")
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, server_default=func.now())

    def overlaps(self, date_debut, date_fin):
        return self.date_debut < date_fin and self.date_fin > date_debut

    def can_conflict(self):
        return self.statut != StatutReservation.annulee

    def confirm(self):
        self.statut = StatutReservation.confirmee
        return self

    def cancel(self):
        self.statut = StatutReservation.annulee
        return self

    def complete(self):
        self.statut = StatutReservation.terminee
        return self

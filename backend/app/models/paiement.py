import enum

from sqlalchemy import CheckConstraint
from sqlalchemy.sql import func

from .. import db
from .base import ModelMixin


class StatutPaiement(str, enum.Enum):
    en_attente = "en_attente"
    paye = "paye"
    echoue = "echoue"


class Paiement(ModelMixin, db.Model):
    __tablename__ = "paiement"
    __public_fields__ = (
        "id_paiement",
        "reservation_id",
        "montant",
        "date_paiement",
        "mode",
        "statut",
        "created_at",
    )
    __table_args__ = (CheckConstraint("montant >= 0", name="ck_paiement_montant_positive"),)

    id_paiement = db.Column(db.BigInteger, primary_key=True)
    reservation_id = db.Column(
        db.BigInteger,
        db.ForeignKey("reservation.id_res", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )
    montant = db.Column(db.Numeric(10, 2), nullable=False)
    date_paiement = db.Column(db.DateTime(timezone=True))
    mode = db.Column(db.String(50))
    statut = db.Column(
        db.Enum(StatutPaiement, name="statut_paiement"),
        nullable=False,
        server_default=StatutPaiement.en_attente.value,
    )
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, server_default=func.now())

    def mark_paid(self, payment_date=None):
        self.statut = StatutPaiement.paye
        self.date_paiement = payment_date
        return self

    def mark_failed(self):
        self.statut = StatutPaiement.echoue
        return self

import enum
from datetime import date as date_cls

from sqlalchemy import CheckConstraint
from sqlalchemy.sql import func

from .. import db
from .base import ModelMixin


class StatutAbonnement(str, enum.Enum):
    actif = "actif"
    expire = "expire"
    suspendu = "suspendu"
    en_attente = "en_attente"


class TypeAbonnement(str, enum.Enum):
    mensuel = "mensuel"
    trimestriel = "trimestriel"
    annuel = "annuel"


class Abonnement(ModelMixin, db.Model):
    __tablename__ = "abonnement"
    __public_fields__ = (
        "id_abon",
        "type",
        "date_debut",
        "date_fin",
        "statut",
        "tarif",
        "created_at",
    )
    __table_args__ = (
        CheckConstraint("tarif >= 0", name="ck_abonnement_tarif_positive"),
        CheckConstraint("date_fin > date_debut", name="ck_abonnement_date_fin_gt_date_debut"),
    )

    id_abon = db.Column(db.BigInteger, primary_key=True, autoincrement=True)
    type = db.Column(db.Enum(TypeAbonnement, name="type_abonnement"), nullable=False)
    date_debut = db.Column(db.Date, nullable=False)
    date_fin = db.Column(db.Date, nullable=False)
    statut = db.Column(
        db.Enum(StatutAbonnement, name="statut_abonnement"),
        nullable=False,
        server_default=StatutAbonnement.en_attente.value,
    )
    tarif = db.Column(db.Numeric(10, 2), nullable=False)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, server_default=func.now())

    def is_active(self):
        return self.statut == StatutAbonnement.actif

    def sync_status_with_dates(self, today=None):
        if self.statut == StatutAbonnement.suspendu:
            return False

        current_day = today or date_cls.today()

        if self.date_fin and current_day > self.date_fin:
            next_status = StatutAbonnement.expire
        elif self.date_debut and current_day < self.date_debut:
            next_status = StatutAbonnement.en_attente
        else:
            next_status = StatutAbonnement.actif

        if self.statut != next_status:
            self.statut = next_status
            return True

        return False

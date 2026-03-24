from sqlalchemy import Index

from .. import db
from .base import ModelMixin


class AbonnementPlace(ModelMixin, db.Model):
    __tablename__ = "abonnement_place"
    __public_fields__ = ("id_abon", "conducteur_id", "place_id")
    __table_args__ = (
        Index("idx_abonnement_place_conducteur_id", "conducteur_id"),
        Index("idx_abonnement_place_place_id", "place_id"),
    )

    id_abon = db.Column(
        db.BigInteger,
        db.ForeignKey("abonnement.id_abon", ondelete="CASCADE"),
        primary_key=True,
    )
    conducteur_id = db.Column(
        db.BigInteger,
        db.ForeignKey("comptes.id_compte", ondelete="CASCADE"),
        nullable=False,
    )
    place_id = db.Column(
        db.BigInteger,
        db.ForeignKey("place.id_place", ondelete="CASCADE"),
        nullable=False,
    )

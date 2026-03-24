from sqlalchemy import Index

from .. import db
from .base import ModelMixin


class AbonnementApp(ModelMixin, db.Model):
    __tablename__ = "abonnement_app"
    __public_fields__ = ("id_abon", "parking_id")
    __table_args__ = (Index("idx_abonnement_app_parking_id", "parking_id"),)

    id_abon = db.Column(
        db.BigInteger,
        db.ForeignKey("abonnement.id_abon", ondelete="CASCADE"),
        primary_key=True,
    )
    parking_id = db.Column(
        db.BigInteger,
        db.ForeignKey("parking.id_park", ondelete="CASCADE"),
        nullable=False,
    )

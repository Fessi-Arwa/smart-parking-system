from sqlalchemy import CheckConstraint, Index, UniqueConstraint
from sqlalchemy.sql import func

from .. import db
from .base import ModelMixin


class Etage(ModelMixin, db.Model):
    __tablename__ = "etage"
    __public_fields__ = (
        "id_etage",
        "parking_id",
        "nom",
        "code",
        "ordre",
        "description",
        "total_places",
        "created_at",
    )
    __table_args__ = (
        CheckConstraint("ordre >= 0", name="ck_etage_ordre_positive"),
        CheckConstraint("total_places >= 0", name="ck_etage_total_places_positive"),
        UniqueConstraint("parking_id", "nom", name="uq_etage_parking_nom"),
        UniqueConstraint("parking_id", "ordre", name="uq_etage_parking_ordre"),
        UniqueConstraint("parking_id", "code", name="uq_etage_parking_code"),
        Index("idx_etage_parking_id", "parking_id"),
    )

    id_etage = db.Column(db.BigInteger, primary_key=True, autoincrement=True)
    parking_id = db.Column(
        db.BigInteger,
        db.ForeignKey("parking.id_park", ondelete="CASCADE"),
        nullable=False,
    )
    nom = db.Column(db.String(100), nullable=False)
    code = db.Column(db.String(50))
    ordre = db.Column(db.Integer, nullable=False, server_default="0")
    description = db.Column(db.Text)
    total_places = db.Column(db.Integer, nullable=False, server_default="0")
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, server_default=func.now())

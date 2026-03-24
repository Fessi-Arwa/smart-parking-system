from sqlalchemy import Index
from sqlalchemy.sql import func

from .. import db
from .base import ModelMixin


class Vehicule(ModelMixin, db.Model):
    __tablename__ = "vehicule"
    __public_fields__ = (
        "id_veh",
        "conducteur_id",
        "matricule",
        "marque",
        "type",
        "created_at",
    )
    __table_args__ = (Index("idx_vehicule_conducteur_id", "conducteur_id"),)

    id_veh = db.Column(db.BigInteger, primary_key=True)
    conducteur_id = db.Column(
        db.BigInteger,
        db.ForeignKey("comptes.id_compte", ondelete="CASCADE"),
        nullable=False,
    )
    matricule = db.Column(db.String(50), unique=True, nullable=False)
    marque = db.Column(db.String(100))
    type = db.Column(db.String(100))
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, server_default=func.now())

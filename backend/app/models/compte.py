import enum

from sqlalchemy.sql import func

from .. import db
from .base import ModelMixin


class RoleCompte(str, enum.Enum):
    conducteur = "conducteur"
    owner = "owner"
    admin = "admin"


class Compte(ModelMixin, db.Model):
    __tablename__ = "comptes"
    __public_fields__ = (
        "id_compte",
        "nom",
        "email",
        "telephone",
        "role",
        "created_at",
        "updated_at",
    )

    id_compte = db.Column(db.BigInteger, primary_key=True, autoincrement=True)
    nom = db.Column(db.String(150), nullable=False)
    email = db.Column(db.String(255), unique=True, nullable=False)
    mot_passe = db.Column(db.String(255), nullable=False)
    telephone = db.Column(db.String(30))
    role = db.Column(db.Enum(RoleCompte, name="role_compte"), nullable=False)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at = db.Column(
        db.DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    def is_admin(self):
        return self.role == RoleCompte.admin

    def is_owner(self):
        return self.role == RoleCompte.owner

    def is_driver(self):
        return self.role == RoleCompte.conducteur

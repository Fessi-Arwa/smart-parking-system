from sqlalchemy import CheckConstraint, Index
from sqlalchemy.sql import func

from .. import db
from .base import ModelMixin


class Feedback(ModelMixin, db.Model):
    __tablename__ = "feedback"
    __public_fields__ = (
        "id_feed",
        "conducteur_id",
        "parking_id",
        "note",
        "commentaire",
        "date_feed",
        "created_at",
    )
    __table_args__ = (
        CheckConstraint("note BETWEEN 1 AND 5", name="ck_feedback_note_range"),
        Index("idx_feedback_conducteur_id", "conducteur_id"),
        Index("idx_feedback_parking_id", "parking_id"),
    )

    id_feed = db.Column(db.BigInteger, primary_key=True, autoincrement=True)
    conducteur_id = db.Column(
        db.BigInteger,
        db.ForeignKey("comptes.id_compte", ondelete="CASCADE"),
        nullable=False,
    )
    parking_id = db.Column(
        db.BigInteger,
        db.ForeignKey("parking.id_park", ondelete="CASCADE"),
        nullable=False,
    )
    note = db.Column(db.Integer, nullable=False)
    commentaire = db.Column(db.Text)
    date_feed = db.Column(db.Date, nullable=False, server_default=func.current_date())
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, server_default=func.now())

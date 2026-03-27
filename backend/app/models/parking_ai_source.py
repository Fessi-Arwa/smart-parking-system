import enum

from sqlalchemy import Index
from sqlalchemy.sql import func

from .. import db
from .base import ModelMixin


class TypeSourceIA(str, enum.Enum):
    image = "image"
    video = "video"
    camera = "camera"


class ParkingAISource(ModelMixin, db.Model):
    __tablename__ = "parking_ai_source"
    __public_fields__ = (
        "id_source",
        "parking_id",
        "source_type",
        "label",
        "file_path",
        "original_name",
        "mime_type",
        "stream_url",
        "created_at",
    )
    __table_args__ = (
        Index("idx_parking_ai_source_parking_id", "parking_id"),
    )

    id_source = db.Column(db.BigInteger, primary_key=True)
    parking_id = db.Column(
        db.BigInteger,
        db.ForeignKey("parking.id_park", ondelete="CASCADE"),
        nullable=False,
    )
    source_type = db.Column(
        db.Enum(TypeSourceIA, name="type_source_ia"),
        nullable=False,
    )
    label = db.Column(db.String(150))
    file_path = db.Column(db.Text)
    original_name = db.Column(db.String(255))
    mime_type = db.Column(db.String(120))
    stream_url = db.Column(db.Text)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, server_default=func.now())

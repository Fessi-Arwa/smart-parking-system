from __future__ import annotations

import enum

from sqlalchemy import Index
from sqlalchemy.sql import func

from .. import db
from .base import ModelMixin


class PlateMatchStatus(str, enum.Enum):
    match = "match"
    mismatch = "mismatch"
    no_plate_detected = "no_plate_detected"
    no_active_reservation = "no_active_reservation"
    error = "error"


class PlateCheck(ModelMixin, db.Model):
    __tablename__ = "plate_check"
    __public_fields__ = (
        "id",
        "parking_id",
        "place_id",
        "reservation_id",
        "source_id",
        "slot_index",
        "detected_plate",
        "expected_plate",
        "normalized_detected_plate",
        "normalized_expected_plate",
        "match_status",
        "confidence",
        "bbox_json",
        "evidence_image_path",
        "service_response",
        "created_at",
    )
    __table_args__ = (
        Index("idx_plate_check_parking_id", "parking_id"),
        Index("idx_plate_check_place_id", "place_id"),
        Index("idx_plate_check_reservation_id", "reservation_id"),
        Index("idx_plate_check_source_id", "source_id"),
        Index("idx_plate_check_created_at", "created_at"),
    )

    id = db.Column(db.BigInteger, primary_key=True, autoincrement=True)
    parking_id = db.Column(
        db.BigInteger,
        db.ForeignKey("parking.id_park", ondelete="CASCADE"),
        nullable=False,
    )
    place_id = db.Column(db.BigInteger, db.ForeignKey("place.id_place", ondelete="SET NULL"))
    reservation_id = db.Column(db.BigInteger, db.ForeignKey("reservation.id_res", ondelete="SET NULL"))
    source_id = db.Column(db.BigInteger, db.ForeignKey("parking_ai_source.id_source", ondelete="SET NULL"))
    slot_index = db.Column(db.Integer)
    detected_plate = db.Column(db.String(120))
    expected_plate = db.Column(db.String(120))
    normalized_detected_plate = db.Column(db.String(120))
    normalized_expected_plate = db.Column(db.String(120))
    match_status = db.Column(
        db.Enum(PlateMatchStatus, name="plate_match_status"),
        nullable=False,
        server_default=PlateMatchStatus.error.value,
    )
    confidence = db.Column(db.Float)
    bbox_json = db.Column(db.Text)
    evidence_image_path = db.Column(db.Text)
    service_response = db.Column(db.Text)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, server_default=func.now())

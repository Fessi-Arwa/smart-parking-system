from .. import db
from datetime import date

class Feedback(db.Model):
    __tablename__ = "feedback"

    id_feed = db.Column(db.BigInteger, primary_key=True)

    conducteur_id = db.Column(
        db.BigInteger,
        db.ForeignKey("comptes.id_compte"),
        nullable=False
    )

    parking_id = db.Column(
        db.BigInteger,
        db.ForeignKey("parking.id_park"),
        nullable=False
    )

    note = db.Column(
        db.Integer,
        nullable=False
    )

    commentaire = db.Column(db.Text)

    date_feed = db.Column(
        db.Date,
        default=date.today,
        nullable=False
    )

    created_at = db.Column(
        db.DateTime(timezone=True),
        server_default=db.func.now()
    )
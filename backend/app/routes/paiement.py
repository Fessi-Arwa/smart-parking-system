from datetime import datetime

from flask import Blueprint, jsonify, request
from flask_jwt_extended import get_jwt_identity, jwt_required

from .. import db
from ..models.paiement import Paiement, StatutPaiement
from ..models.reservation import Reservation

paiement_bp = Blueprint("paiement", __name__)

@paiement_bp.route("/simulate", methods=["GET", "POST"])
def simulate():
    if request.method == "POST":
        data = request.get_json() or {}
        amount = data.get("amount")
        method = data.get("method")

        if amount is None or not method:
            return jsonify({"error": "amount and method are required"}), 400

        return jsonify(
            {
                "msg": "payment ok",
                "status": "paid",
                "amount": amount,
                "method": method,
            }
        ), 200

    return jsonify({"msg": "payment ok", "status": "ready"}), 200


@paiement_bp.route("/", methods=["POST"])
@jwt_required()
def create_payment():
    data = request.get_json() or {}
    reservation_id = data.get("reservation_id")
    montant = data.get("montant")
    mode = data.get("mode")

    if reservation_id is None or montant is None or not mode:
        return jsonify({"error": "reservation_id, montant and mode are required"}), 400

    try:
        reservation_id = int(reservation_id)
        montant = float(montant)
    except (TypeError, ValueError):
        return jsonify({"error": "Invalid reservation_id or montant"}), 400

    if montant < 0:
        return jsonify({"error": "Montant invalide"}), 400

    user_id = int(get_jwt_identity())
    reservation = Reservation.query.get(reservation_id)
    if not reservation:
        return jsonify({"error": "Reservation not found"}), 404

    if reservation.conducteur_id != user_id:
        return jsonify({"error": "Reservation does not belong to the authenticated driver"}), 403

    existing_payment = Paiement.query.filter_by(reservation_id=reservation_id).first()
    if existing_payment:
        return jsonify({"error": "Payment already exists for this reservation"}), 409

    paiement = Paiement(
        reservation_id=reservation_id,
        montant=montant,
        mode=mode,
        statut=StatutPaiement.paye,
        date_paiement=datetime.utcnow(),
    )

    db.session.add(paiement)
    db.session.commit()

    return jsonify(
        {
            "msg": "Payment saved successfully",
            "payment": paiement.to_dict(),
        }
    ), 201

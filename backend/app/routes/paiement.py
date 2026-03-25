from flask import Blueprint, jsonify

paiement_bp = Blueprint("paiement", __name__)

@paiement_bp.route("/simulate")
def simulate():
    return jsonify({"msg": "payment ok"})
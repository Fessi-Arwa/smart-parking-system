from flask import Blueprint, request, jsonify

reservation_bp = Blueprint("reservation", __name__)

@reservation_bp.route("/", methods=["POST"])
def reserve():
    return jsonify({"msg": "reservation created"})
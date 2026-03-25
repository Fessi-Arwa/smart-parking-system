from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from ..controllers.reservation_controller import create_reservation


reservation_bp = Blueprint("reservation", __name__)

# 🧪 TEST ROUTE
@reservation_bp.route("/test", methods=["GET"])
def test():
    return "OK"

@reservation_bp.route("/", methods=["POST"])
@jwt_required()
def reserve():
    
    data = request.json
    user = get_jwt_identity()

    result, status = create_reservation(data, user["id"])

    return jsonify(result), status

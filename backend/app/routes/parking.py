from flask import Blueprint, jsonify
from ..models.parking import Parking

parking_bp = Blueprint("parking", __name__)

@parking_bp.route("/", methods=["GET"])
def get_all():
    parkings = Parking.query.all()
    return jsonify([p.nom for p in parkings])
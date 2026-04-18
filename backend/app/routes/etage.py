from flask import Blueprint, jsonify, request
from flask_jwt_extended import get_jwt_identity, jwt_required

from .. import db
from ..models.compte import Compte, RoleCompte
from ..models.etage import Etage
from ..models.parking import Parking, StatutValidationParking


etage_bp = Blueprint("etage", __name__)


def _get_actor():
    user_id = get_jwt_identity()
    if user_id is None:
        return None
    return Compte.query.get(int(user_id))


def _can_manage_parking(user, parking):
    if not user or not parking:
        return False
    return user.role == RoleCompte.admin or parking.owner_id == user.id_compte


def _ensure_parking_validated(parking):
    if not parking:
        return jsonify({"error": "Parking not found"}), 404
    if parking.validation_status != StatutValidationParking.valide:
        return jsonify({"error": "Le parking doit etre valide avant de manipuler ses etages"}), 400
    return None


@etage_bp.route("/", methods=["GET"])
def get_etages():
    query = Etage.query

    parking_id = request.args.get("parking_id", type=int)
    if parking_id is not None:
        query = query.filter(Etage.parking_id == parking_id)

    etages = query.order_by(Etage.ordre.asc(), Etage.id_etage.asc()).all()
    return jsonify([etage.to_dict() for etage in etages])


@etage_bp.route("/<int:etage_id>", methods=["GET"])
def get_etage(etage_id):
    etage = Etage.query.get(etage_id)
    if not etage:
        return jsonify({"error": "Etage not found"}), 404
    return jsonify(etage.to_dict())


@etage_bp.route("/", methods=["POST"])
@jwt_required()
def create_etage():
    data = request.get_json() or {}

    if data.get("parking_id") is None or not (data.get("nom") or "").strip():
        return jsonify({"error": "parking_id and nom are required"}), 400

    parking = Parking.query.get(data["parking_id"])
    if not parking:
        return jsonify({"error": "Parking not found"}), 404

    validation_error = _ensure_parking_validated(parking)
    if validation_error:
        return validation_error

    user = _get_actor()
    if not user:
        return jsonify({"error": "User not found"}), 404

    if not _can_manage_parking(user, parking):
        return jsonify({"error": "Unauthorized to manage floors for this parking"}), 403

    etage = Etage(
        parking_id=data["parking_id"],
        nom=(data.get("nom") or "").strip(),
        ordre=int(data.get("ordre") or 0),
    )

    db.session.add(etage)
    db.session.commit()

    return jsonify(etage.to_dict()), 201


@etage_bp.route("/<int:etage_id>", methods=["PUT"])
@jwt_required()
def update_etage(etage_id):
    etage = Etage.query.get(etage_id)
    if not etage:
        return jsonify({"error": "Etage not found"}), 404

    parking = Parking.query.get(etage.parking_id)
    validation_error = _ensure_parking_validated(parking)
    if validation_error:
        return validation_error

    user = _get_actor()
    if not user:
        return jsonify({"error": "User not found"}), 404

    if not _can_manage_parking(user, parking):
        return jsonify({"error": "Unauthorized to update this floor"}), 403

    data = request.get_json() or {}
    if "nom" in data:
        etage.nom = (data.get("nom") or "").strip()
    if "ordre" in data:
        etage.ordre = int(data.get("ordre") or 0)

    db.session.commit()
    return jsonify(etage.to_dict())


@etage_bp.route("/<int:etage_id>", methods=["DELETE"])
@jwt_required()
def delete_etage(etage_id):
    etage = Etage.query.get(etage_id)
    if not etage:
        return jsonify({"error": "Etage not found"}), 404

    parking = Parking.query.get(etage.parking_id)
    validation_error = _ensure_parking_validated(parking)
    if validation_error:
        return validation_error

    user = _get_actor()
    if not user:
        return jsonify({"error": "User not found"}), 404

    if not _can_manage_parking(user, parking):
        return jsonify({"error": "Unauthorized to delete this floor"}), 403

    db.session.delete(etage)
    db.session.commit()
    return jsonify({"msg": "Etage deleted"})

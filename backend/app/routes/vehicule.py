from flask import Blueprint, jsonify, request
from flask_jwt_extended import get_jwt_identity, jwt_required

from .. import db
from ..models.compte import Compte, RoleCompte
from ..models.vehicule import Vehicule


vehicule_bp = Blueprint("vehicule", __name__)


@vehicule_bp.route("/", methods=["GET"])
@jwt_required()
def get_vehicles():
    user_id = get_jwt_identity()
    user = Compte.query.get(int(user_id))

    if not user:
        return jsonify({"msg": "Utilisateur introuvable"}), 404

    if user.role != RoleCompte.conducteur:
        return jsonify({"msg": "Seuls les conducteurs peuvent consulter leurs vehicules"}), 403

    vehicules = (
        Vehicule.query.filter_by(conducteur_id=user.id_compte)
        .order_by(Vehicule.created_at.desc(), Vehicule.id_veh.desc())
        .all()
    )
    return jsonify([vehicule.to_dict() for vehicule in vehicules]), 200


@vehicule_bp.route("/", methods=["POST"])
@jwt_required()
def create_vehicle():
    data = request.get_json() or {}
    user_id = get_jwt_identity()
    user = Compte.query.get(int(user_id))

    if not user:
        return jsonify({"msg": "Utilisateur introuvable"}), 404

    if user.role != RoleCompte.conducteur:
        return jsonify({"msg": "Seuls les conducteurs peuvent ajouter un vehicule"}), 403

    matricule = data.get("matricule")
    if not matricule:
        return jsonify({"msg": "matricule est obligatoire"}), 400

    existing_vehicle = Vehicule.query.filter_by(matricule=matricule).first()
    if existing_vehicle:
        return jsonify({"msg": "Ce matricule existe deja"}), 400

    vehicule = Vehicule(
        conducteur_id=user.id_compte,
        matricule=matricule,
        marque=data.get("marque"),
        type=data.get("type"),
    )

    db.session.add(vehicule)
    db.session.commit()

    return jsonify({"msg": "Vehicule cree avec succes", "vehicule": vehicule.to_dict()}), 201

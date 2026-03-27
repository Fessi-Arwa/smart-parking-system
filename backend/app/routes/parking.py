from flask import Blueprint, jsonify, request
from flask_jwt_extended import get_jwt_identity, jwt_required

from .. import db
from ..models.compte import Compte, RoleCompte
from ..models.parking import Parking, StatutConfigurationIA, StatutConfigurationParking, StatutValidationParking

parking_bp = Blueprint("parking", __name__)

@parking_bp.route("/", methods=["GET"])
def get_all():
    parkings = Parking.query.all()
    return jsonify([p.to_dict() for p in parkings])


@parking_bp.route("/", methods=["POST"])
@jwt_required()
def create_parking():
    data = request.get_json() or {}
    user_id = get_jwt_identity()
    user = Compte.query.get(int(user_id))

    if not user:
        return jsonify({"msg": "Utilisateur introuvable"}), 404

    if user.role != RoleCompte.owner:
        return jsonify({"msg": "Seuls les owners peuvent ajouter un parking"}), 403

    required_fields = ("nom", "adresse", "capacite", "prix_heure")
    missing_fields = [field for field in required_fields if data.get(field) in (None, "")]
    if missing_fields:
        return jsonify({"msg": "nom, adresse, capacite et prix_heure sont obligatoires"}), 400

    try:
        capacite = int(data["capacite"])
        prix_heure = float(data["prix_heure"])
    except (TypeError, ValueError):
        return jsonify({"msg": "capacite et prix_heure doivent être numériques"}), 400

    if capacite < 0 or prix_heure < 0:
        return jsonify({"msg": "capacite et prix_heure doivent être positifs"}), 400

    parking = Parking(
        owner_id=user.id_compte,
        nom=data["nom"],
        adresse=data["adresse"],
        capacite=capacite,
        prix_heure=prix_heure,
        validation_status=StatutValidationParking.en_attente_validation,
        setup_status=StatutConfigurationParking.non_commencee,
        ai_setup_status=StatutConfigurationIA.non_configuree,
    )

    db.session.add(parking)
    db.session.commit()

    return jsonify({"msg": "Parking créé avec succès", "parking": parking.to_dict()}), 201
@parking_bp.route("/<int:parking_id>", methods=["GET"])
def get_parking(parking_id):
    parking = Parking.query.get(parking_id)
    if not parking:
        return jsonify({"msg": "Parking introuvable"}), 404
    return jsonify(parking.to_dict()), 200
@parking_bp.route("/<int:parking_id>", methods=["PUT"])
@jwt_required()
def update_parking(parking_id):
    parking = Parking.query.get(parking_id)
    if not parking:
        return jsonify({"msg": "Parking introuvable"}), 404

    user_id = get_jwt_identity()
    user = Compte.query.get(int(user_id))

    if not user:
        return jsonify({"msg": "Utilisateur introuvable"}), 404

    if parking.owner_id != user.id_compte:
        return jsonify({"msg": "Seuls les owners peuvent modifier leur parking"}), 403

    data = request.get_json() or {}
    for field in ("nom", "adresse", "capacite", "prix_heure"):
        if field in data:
            setattr(parking, field, data[field])

    db.session.commit()
    return jsonify({"msg": "Parking mis à jour avec succès", "parking": parking.to_dict()}), 200
@parking_bp.route("/<int:parking_id>", methods=["DELETE"])
@jwt_required()
def delete_parking(parking_id):
    parking = Parking.query.get(parking_id)
    if not parking:
        return jsonify({"msg": "Parking introuvable"}), 404

    user_id = get_jwt_identity()
    user = Compte.query.get(int(user_id))

    if not user:
        return jsonify({"msg": "Utilisateur introuvable"}), 404

    if parking.owner_id != user.id_compte:
        return jsonify({"msg": "Seuls les owners peuvent supprimer leur parking"}), 403

    db.session.delete(parking)
    db.session.commit()
    return jsonify({"msg": "Parking supprimé avec succès"}), 200

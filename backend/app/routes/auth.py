from flask import Blueprint, request, jsonify
from ..models.compte import Compte
from .. import db
from flask_jwt_extended import create_access_token

auth_bp = Blueprint("auth", __name__)

@auth_bp.route("/register", methods=["POST"])
def register():
    data = request.json

    user = Compte(
        nom=data["nom"],
        email=data["email"],
        mot_passe=data["mot_passe"],
        role="conducteur"
    )

    db.session.add(user)
    db.session.commit()

    return jsonify({"msg": "created"})
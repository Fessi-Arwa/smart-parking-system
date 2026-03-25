from flask import Blueprint, request, jsonify
from ..models.compte import Compte
from ..models.compte import RoleCompte
from .. import db
from flask_jwt_extended import create_access_token
from werkzeug.security import check_password_hash, generate_password_hash

auth_bp = Blueprint("auth", __name__)

@auth_bp.route("/register", methods=["POST"])
def register():
    data = request.get_json()
    nom=data.get("nom")
    email=data.get("email")        
    telephone=data.get("telephone")
    mot_passe=data.get("mot_passe")
    role_str=data.get("role", "conducteur")
    
    if not nom or not email or not mot_passe:
        return jsonify({"msg": "Tous les champs sont obligatoires"}), 400
    existing_user = Compte.query.filter_by(email=email).first()
    if existing_user:
        return jsonify({"msg": "Email déjà utilisé"}), 400
    try:
        role = RoleCompte(role_str)
    except ValueError:
        return jsonify({"msg": "Role invalide"}), 400

    hashed_password = generate_password_hash(mot_passe)
    user = Compte(
        nom=nom,
        email=email,    
        telephone=telephone,
        mot_passe=hashed_password,
        role=role
    )

    db.session.add(user)
    db.session.commit()
    access_token=create_access_token(identity=str(user.id_compte))
    return jsonify({
        "msg": "Compte créé avec succès",
        "access_token": access_token,
        "user": {
            "id": user.id_compte,
            "nom": user.nom,
            "email": user.email,
            "telephone": user.telephone,
            "role": user.role.value
        }
    }), 201
@auth_bp.route("/login", methods=["POST"])
def login():
    data = request.get_json()
    email=data.get("email")        
    mot_passe=data.get("mot_passe")
    
    if not email or not mot_passe:
        return jsonify({"msg": "Email et mot de passe sont obligatoires"}), 400
    user = Compte.query.filter_by(email=email).first()
    if not user or not check_password_hash(user.mot_passe, mot_passe):
        return jsonify({"msg": "Email ou mot de passe incorrect"}), 401
    access_token=create_access_token(identity=str(user.id_compte))
    return jsonify({
        "msg": "Connexion réussie",
        "access_token": access_token,
        "user": {
            "id": user.id_compte,
            "nom": user.nom,
            "email": user.email,
            "telephone": user.telephone,
            "role": user.role.value
        }
    }), 200

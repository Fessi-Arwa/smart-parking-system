from flask import Blueprint, current_app, request, jsonify
from ..models.compte import Compte
from ..models.compte import RoleCompte
from .. import db
from flask_jwt_extended import create_access_token
from itsdangerous import URLSafeTimedSerializer, BadSignature, SignatureExpired
from werkzeug.security import check_password_hash, generate_password_hash

auth_bp = Blueprint("auth", __name__)
PASSWORD_RESET_SALT = "password-reset"
PASSWORD_RESET_MAX_AGE = 1800


def _password_reset_serializer():
    return URLSafeTimedSerializer(current_app.config["SECRET_KEY"])


def _create_password_reset_token(email):
    return _password_reset_serializer().dumps(email, salt=PASSWORD_RESET_SALT)


def _verify_password_reset_token(token):
    return _password_reset_serializer().loads(
        token,
        salt=PASSWORD_RESET_SALT,
        max_age=PASSWORD_RESET_MAX_AGE,
    )

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


@auth_bp.route("/forgot-password", methods=["POST"])
def forgot_password():
    data = request.get_json() or {}
    email = (data.get("email") or "").strip().lower()

    if not email:
        return jsonify({"msg": "Email obligatoire"}), 400

    user = Compte.query.filter_by(email=email).first()

    if user:
        reset_token = _create_password_reset_token(user.email.lower())
        return jsonify({
            "msg": "Lien de réinitialisation généré avec succès.",
            "reset_token": reset_token,
        }), 200

    return jsonify({
        "msg": "Si un compte existe avec cet email, les instructions de réinitialisation ont été envoyées."
    }), 200


@auth_bp.route("/reset-password", methods=["POST"])
def reset_password():
    data = request.get_json() or {}
    token = (data.get("token") or "").strip()
    mot_passe = data.get("mot_passe")

    if not token or not mot_passe:
        return jsonify({"msg": "Token et mot de passe obligatoires"}), 400

    if len(mot_passe) < 6:
        return jsonify({"msg": "Le mot de passe doit contenir au moins 6 caractères"}), 400

    try:
        email = _verify_password_reset_token(token)
    except SignatureExpired:
        return jsonify({"msg": "Le lien de réinitialisation a expiré"}), 400
    except BadSignature:
        return jsonify({"msg": "Le lien de réinitialisation est invalide"}), 400

    user = Compte.query.filter_by(email=email).first()
    if not user:
        return jsonify({"msg": "Le lien de réinitialisation est invalide"}), 400

    user.mot_passe = generate_password_hash(mot_passe)
    db.session.commit()

    return jsonify({"msg": "Mot de passe réinitialisé avec succès"}), 200

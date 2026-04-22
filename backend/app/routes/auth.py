from flask import Blueprint, current_app, jsonify, request
from flask_jwt_extended import create_access_token, get_jwt_identity, jwt_required
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer
from werkzeug.security import check_password_hash, generate_password_hash

from .. import db
from ..models.compte import Compte, RoleCompte, StatutValidationOwner


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


def _serialize_user(user):
    return {
        "id": user.id_compte,
        "nom": user.nom,
        "email": user.email,
        "telephone": user.telephone,
        "role": user.role.value,
        "owner_status": user.owner_status.value if getattr(user, "owner_status", None) else None,
        "owner_status_reason": getattr(user, "owner_status_reason", None),
    }


@auth_bp.route("/register", methods=["POST"])
def register():
    data = request.get_json() or {}
    nom = data.get("nom")
    email = data.get("email")
    telephone = data.get("telephone")
    mot_passe = data.get("mot_passe")
    role_str = data.get("role", "conducteur")

    if not nom or not email or not mot_passe:
        return jsonify({"msg": "Tous les champs sont obligatoires"}), 400

    existing_user = Compte.query.filter_by(email=email).first()
    if existing_user:
        return jsonify({"msg": "Email deja utilise"}), 400

    try:
        role = RoleCompte(role_str)
    except ValueError:
        return jsonify({"msg": "Role invalide"}), 400

    if role == RoleCompte.admin:
        return jsonify({"msg": "La creation d un compte admin n est pas autorisee via l inscription publique"}), 403

    hashed_password = generate_password_hash(mot_passe)
    owner_status = (
        StatutValidationOwner.en_attente
        if role == RoleCompte.owner
        else StatutValidationOwner.accepte
    )
    user = Compte(
        nom=nom,
        email=email,
        telephone=telephone,
        mot_passe=hashed_password,
        role=role,
        owner_status=owner_status,
    )

    db.session.add(user)
    db.session.commit()

    access_token = create_access_token(identity=str(user.id_compte))
    return jsonify(
        {
            "msg": "Compte cree avec succes",
            "access_token": access_token,
            "user": _serialize_user(user),
        }
    ), 201


@auth_bp.route("/login", methods=["POST"])
def login():
    data = request.get_json() or {}
    email = data.get("email")
    mot_passe = data.get("mot_passe")

    if not email or not mot_passe:
        return jsonify({"msg": "Email et mot de passe sont obligatoires"}), 400

    user = Compte.query.filter_by(email=email).first()
    if not user or not check_password_hash(user.mot_passe, mot_passe):
        return jsonify({"msg": "Email ou mot de passe incorrect"}), 401

    access_token = create_access_token(identity=str(user.id_compte))
    return jsonify(
        {
            "msg": "Connexion reussie",
            "access_token": access_token,
            "user": _serialize_user(user),
        }
    ), 200


@auth_bp.route("/profile", methods=["GET"])
@jwt_required()
def get_profile():
    user_id = get_jwt_identity()
    user = Compte.query.get(int(user_id))

    if not user:
        return jsonify({"msg": "Utilisateur introuvable"}), 404

    return jsonify(_serialize_user(user)), 200


@auth_bp.route("/profile", methods=["PUT"])
@jwt_required()
def update_profile():
    data = request.get_json() or {}
    user_id = get_jwt_identity()
    user = Compte.query.get(int(user_id))

    if not user:
        return jsonify({"msg": "Utilisateur introuvable"}), 404

    email = (data.get("email") or "").strip().lower()
    if email and email != user.email.lower():
        existing_user = Compte.query.filter_by(email=email).first()
        if existing_user:
            return jsonify({"msg": "Email deja utilise"}), 400
        user.email = email

    user.update_from_dict(data, ("nom", "telephone"))

    db.session.commit()
    return jsonify(_serialize_user(user)), 200


@auth_bp.route("/forgot-password", methods=["POST"])
def forgot_password():
    data = request.get_json() or {}
    email = (data.get("email") or "").strip().lower()

    if not email:
        return jsonify({"msg": "Email obligatoire"}), 400

    user = Compte.query.filter_by(email=email).first()

    if user:
        reset_token = _create_password_reset_token(user.email.lower())
        return jsonify(
            {
                "msg": "Lien de reinitialisation genere avec succes.",
                "reset_token": reset_token,
            }
        ), 200

    return jsonify(
        {
            "msg": "Si un compte existe avec cet email, les instructions de reinitialisation ont ete envoyees."
        }
    ), 200


@auth_bp.route("/reset-password", methods=["POST"])
def reset_password():
    data = request.get_json() or {}
    token = (data.get("token") or "").strip()
    mot_passe = data.get("mot_passe")

    if not token or not mot_passe:
        return jsonify({"msg": "Token et mot de passe obligatoires"}), 400

    if len(mot_passe) < 6:
        return jsonify({"msg": "Le mot de passe doit contenir au moins 6 caracteres"}), 400

    try:
        email = _verify_password_reset_token(token)
    except SignatureExpired:
        return jsonify({"msg": "Le lien de reinitialisation a expire"}), 400
    except BadSignature:
        return jsonify({"msg": "Le lien de reinitialisation est invalide"}), 400

    user = Compte.query.filter_by(email=email).first()
    if not user:
        return jsonify({"msg": "Le lien de reinitialisation est invalide"}), 400

    user.mot_passe = generate_password_hash(mot_passe)
    db.session.commit()

    return jsonify({"msg": "Mot de passe reinitialise avec succes"}), 200

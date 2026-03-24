from flask import Flask
from flask_sqlalchemy import SQLAlchemy
from flask_jwt_extended import JWTManager
from flask_cors import CORS
from .config import Config

db = SQLAlchemy()
jwt = JWTManager()

def create_app():
    app = Flask(__name__)
    app.config.from_object(Config)

    db.init_app(app)
    jwt.init_app(app)
    CORS(app)

    # routes
    from .routes.auth import auth_bp
    from .routes.parking import parking_bp
    from .routes.reservation import reservation_bp
    from .routes.paiement import paiement_bp

    app.register_blueprint(auth_bp, url_prefix="/api/auth")
    app.register_blueprint(parking_bp, url_prefix="/api/parkings")
    app.register_blueprint(reservation_bp, url_prefix="/api/reservations")
    app.register_blueprint(paiement_bp, url_prefix="/api/paiements")

    return app
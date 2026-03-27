from flask import Flask
from flask_migrate import Migrate
from flask_sqlalchemy import SQLAlchemy
from flask_jwt_extended import JWTManager
from flask_cors import CORS
from .config import Config


db = SQLAlchemy()
jwt = JWTManager()
migrate = Migrate()

def create_app():
    app = Flask(__name__)
    app.config.from_object(Config)
    db.init_app(app)
    migrate.init_app(app, db, compare_type=True)
    jwt.init_app(app)
    CORS(app)

    # Ensure SQLAlchemy loads every model metadata on startup.
    from . import models  # noqa: F401

    # routes
    from .routes.abonnement import abonnement_bp
    from .routes.admin import admin_bp
    from .routes.ai import ai_bp
    from .routes.auth import auth_bp
    from .routes.health import health_bp
    from .routes.parking import parking_bp
    from .routes.place import place_bp
    from .routes.reservation import reservation_bp
    from .routes.paiement import paiement_bp
    from .routes.owner_workflow import owner_workflow_bp
    from .routes.vehicule import vehicule_bp

    app.register_blueprint(abonnement_bp, url_prefix="/api/abonnements")
    app.register_blueprint(admin_bp, url_prefix="/api/admin")
    app.register_blueprint(ai_bp, url_prefix="/api/ai")
    app.register_blueprint(auth_bp, url_prefix="/api/auth")
    app.register_blueprint(health_bp, url_prefix="/api/health")
    app.register_blueprint(parking_bp, url_prefix="/api/parkings")
    app.register_blueprint(place_bp, url_prefix="/api/places")
    app.register_blueprint(reservation_bp, url_prefix="/api/reservations")
    app.register_blueprint(paiement_bp, url_prefix="/api/paiements")
    app.register_blueprint(owner_workflow_bp, url_prefix="/api/owner")
    app.register_blueprint(vehicule_bp, url_prefix="/api/vehicules")

    @app.get("/")
    def root():
        return {
            "status": "ok",
            "service": "smart-parking-backend",
            "health": "/api/health/db",
        }

    return app

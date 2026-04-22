import warnings

from flask import Flask
from flask_sqlalchemy import SQLAlchemy
from flask_jwt_extended import JWTManager
from flask_cors import CORS
from sqlalchemy import inspect, text
from .config import Config

try:
    from flask_migrate import Migrate
except ModuleNotFoundError:
    Migrate = None


db = SQLAlchemy()
jwt = JWTManager()
migrate = Migrate() if Migrate else None


def _ensure_runtime_schema_compatibility(app):
    inspector = inspect(db.engine)

    def has_table(table_name):
        return inspector.has_table(table_name)

    def get_columns(table_name):
        if not has_table(table_name):
            return set()
        return {column["name"] for column in inspector.get_columns(table_name)}

    def add_column_if_missing(table_name, column_name, ddl):
        columns = get_columns(table_name)
        if column_name in columns:
            return
        db.session.execute(text(f"ALTER TABLE {table_name} ADD COLUMN {ddl}"))
        db.session.commit()

    try:
        db.create_all()

        add_column_if_missing(
            "comptes",
            "owner_status",
            "owner_status VARCHAR(30) NOT NULL DEFAULT 'en_attente'",
        )
        add_column_if_missing(
            "comptes",
            "created_at",
            "created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP",
        )
        add_column_if_missing(
            "comptes",
            "updated_at",
            "updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP",
        )

        add_column_if_missing(
            "parking",
            "capacite",
            "capacite INTEGER NOT NULL DEFAULT 0",
        )
        add_column_if_missing(
            "parking",
            "validation_status",
            "validation_status VARCHAR(40) NOT NULL DEFAULT 'brouillon'",
        )
        add_column_if_missing(
            "parking",
            "setup_status",
            "setup_status VARCHAR(40) NOT NULL DEFAULT 'non_commencee'",
        )
        add_column_if_missing(
            "parking",
            "ai_setup_status",
            "ai_setup_status VARCHAR(40) NOT NULL DEFAULT 'non_configuree'",
        )
        add_column_if_missing(
            "parking",
            "created_at",
            "created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP",
        )
        add_column_if_missing(
            "parking_ai_source",
            "bucket_key",
            "bucket_key TEXT",
        )

        add_column_if_missing(
            "abonnement",
            "created_at",
            "created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP",
        )
        add_column_if_missing(
            "abonnement",
            "statut",
            "statut VARCHAR(20) NOT NULL DEFAULT 'en_attente'",
        )
        add_column_if_missing(
            "abonnement",
            "tarif",
            "tarif NUMERIC(10,2) NOT NULL DEFAULT 0",
        )
        add_column_if_missing(
            "abonnement",
            "cancelled_at",
            "cancelled_at TIMESTAMP",
        )

        add_column_if_missing(
            "place",
            "etage_id",
            "etage_id BIGINT",
        )
        add_column_if_missing(
            "place",
            "zone",
            "zone VARCHAR(100)",
        )
        add_column_if_missing(
            "place",
            "etage",
            "etage VARCHAR(50)",
        )
        add_column_if_missing(
            "place",
            "created_at",
            "created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP",
        )

        add_column_if_missing(
            "etage",
            "code",
            "code VARCHAR(50)",
        )
        add_column_if_missing(
            "etage",
            "description",
            "description TEXT",
        )
        add_column_if_missing(
            "etage",
            "total_places",
            "total_places INTEGER NOT NULL DEFAULT 0",
        )
        add_column_if_missing(
            "etage",
            "created_at",
            "created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP",
        )

        db.session.execute(
            text(
                """
                UPDATE comptes
                SET owner_status = CASE
                    WHEN role = 'owner' THEN CAST('en_attente' AS statut_validation_owner)
                    ELSE CAST('accepte' AS statut_validation_owner)
                END
                WHERE owner_status IS NULL OR CAST(owner_status AS TEXT) = ''
                """
            )
        )
        db.session.execute(
            text(
                """
                UPDATE parking
                SET validation_status = CASE
                        WHEN validation_status IS NULL OR CAST(validation_status AS TEXT) = ''
                            THEN CAST('en_attente_validation' AS statut_validation_parking)
                        ELSE validation_status
                    END,
                    setup_status = CASE
                        WHEN setup_status IS NULL OR CAST(setup_status AS TEXT) = ''
                            THEN CAST('non_commencee' AS statut_configuration_parking)
                        ELSE setup_status
                    END,
                    ai_setup_status = CASE
                        WHEN ai_setup_status IS NULL OR CAST(ai_setup_status AS TEXT) = ''
                            THEN CAST('non_configuree' AS statut_configuration_ia)
                        ELSE ai_setup_status
                    END,
                    statut = CASE
                        WHEN statut IS NULL OR CAST(statut AS TEXT) = ''
                            THEN CAST('actif' AS statut_parking)
                        ELSE statut
                    END,
                    capacite = COALESCE(capacite, 0)
                """
            )
        )
        db.session.execute(
            text(
                """
                UPDATE abonnement
                SET statut = CASE
                        WHEN statut IS NULL OR CAST(statut AS TEXT) = ''
                            THEN CAST('en_attente' AS statut_abonnement)
                        ELSE statut
                    END,
                    tarif = COALESCE(tarif, 0)
                """
            )
        )
        db.session.commit()
    except Exception as exc:
        db.session.rollback()
        app.logger.warning("Database compatibility bootstrap skipped: %s", exc)

def create_app():
    app = Flask(__name__)
    app.config.from_object(Config)
    db.init_app(app)
    if migrate:
        migrate.init_app(app, db, compare_type=True)
    else:
        warnings.warn(
            "Flask-Migrate is not installed. Database migration commands are disabled.",
            RuntimeWarning,
            stacklevel=2,
        )
    jwt.init_app(app)
    CORS(app)

    # Ensure SQLAlchemy loads every model metadata on startup.
    from . import models  # noqa: F401

    with app.app_context():
        _ensure_runtime_schema_compatibility(app)

    # routes
    from .routes.abonnement import abonnement_bp
    from .routes.admin import admin_bp
    from .routes.ai import ai_bp
    from .routes.auth import auth_bp
    from .routes.etage import etage_bp
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
    app.register_blueprint(etage_bp, url_prefix="/api/etages")
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

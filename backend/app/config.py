import os
from pathlib import Path

from dotenv import load_dotenv


load_dotenv(Path(__file__).resolve().parents[1] / ".env")


def _build_database_uri():
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        return "sqlite:///smart_parking.db"

    # Supabase/Postgres URLs may use the legacy postgres:// scheme.
    if database_url.startswith("postgres://"):
        return database_url.replace("postgres://", "postgresql://", 1)

    return database_url


class Config:
    SECRET_KEY = os.getenv("SECRET_KEY", "smart-parking-dev-secret-key-2026")
    SQLALCHEMY_DATABASE_URI = _build_database_uri()
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SQLALCHEMY_ENGINE_OPTIONS = {"pool_pre_ping": True}
    JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "smart-parking-jwt-dev-secret-key-2026")
    PLATE_RECOGNITION_API_URL = os.getenv("PLATE_RECOGNITION_API_URL", "").strip()
    PLATE_RECOGNITION_API_TOKEN = os.getenv("PLATE_RECOGNITION_API_TOKEN", "").strip()
    PLATE_RECOGNITION_API_TIMEOUT = max(3, int(os.getenv("PLATE_RECOGNITION_API_TIMEOUT", "15")))
    PLATE_RECOGNITION_MIN_CONFIDENCE = max(0.0, float(os.getenv("PLATE_RECOGNITION_MIN_CONFIDENCE", "0.0")))
    UPLOAD_FOLDER = os.getenv(
        "UPLOAD_FOLDER",
        str(Path(__file__).resolve().parents[1] / "uploads"),
    )
    # Limites de stockage (en bytes)
    MAX_UPLOAD_SIZE = 500 * 1024 * 1024  # 500 MB par fichier
    MAX_TOTAL_UPLOADS = 20 * 1024 * 1024 * 1024  # 20 GB total
    UPLOAD_RETENTION_DAYS = 30  # Nettoyer les fichiers après 30 jours

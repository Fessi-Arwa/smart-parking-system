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
    SECRET_KEY = os.getenv("SECRET_KEY", "super-secret")
    SQLALCHEMY_DATABASE_URI = _build_database_uri()
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SQLALCHEMY_ENGINE_OPTIONS = {"pool_pre_ping": True}
    JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "jwt-secret")

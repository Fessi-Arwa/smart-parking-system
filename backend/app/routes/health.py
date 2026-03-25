from flask import Blueprint, jsonify
from sqlalchemy import text

from .. import db


health_bp = Blueprint("health", __name__)


@health_bp.route("/db", methods=["GET"])
def db_health():
    try:
        result = db.session.execute(text("select 1")).scalar()
        return jsonify(
            {
                "status": "ok",
                "database": "connected",
                "result": result,
            }
        )
    except Exception as exc:
        return jsonify(
            {
                "status": "error",
                "database": "disconnected",
                "error": str(exc),
            }
        ), 500

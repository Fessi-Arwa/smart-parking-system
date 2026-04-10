"""add identity defaults for bigint primary keys

Revision ID: 4c2f9e7a1b3d
Revises: 8f3c1f2a7b91
Create Date: 2026-03-27 11:35:00.000000

"""

from alembic import op


# revision identifiers, used by Alembic.
revision = "4c2f9e7a1b3d"
down_revision = "8f3c1f2a7b91"
branch_labels = None
depends_on = None


def _ensure_sequence(table_name: str, column_name: str) -> None:
    sequence_name = f"{table_name}_{column_name}_seq"
    op.execute(f'CREATE SEQUENCE IF NOT EXISTS "{sequence_name}"')
    op.execute(
        f"""
        SELECT setval(
            '"{sequence_name}"',
            COALESCE((SELECT MAX("{column_name}") FROM "{table_name}"), 0) + 1,
            false
        )
        """
    )
    op.execute(
        f'ALTER TABLE "{table_name}" ALTER COLUMN "{column_name}" SET DEFAULT nextval(\'"{sequence_name}"\')'
    )
    op.execute(f'ALTER SEQUENCE "{sequence_name}" OWNED BY "{table_name}"."{column_name}"')


def _drop_sequence_default(table_name: str, column_name: str) -> None:
    sequence_name = f"{table_name}_{column_name}_seq"
    op.execute(f'ALTER TABLE "{table_name}" ALTER COLUMN "{column_name}" DROP DEFAULT')
    op.execute(f'DROP SEQUENCE IF EXISTS "{sequence_name}"')


def upgrade():
    _ensure_sequence("comptes", "id_compte")
    _ensure_sequence("parking", "id_park")
    _ensure_sequence("place", "id_place")
    _ensure_sequence("vehicule", "id_veh")
    _ensure_sequence("reservation", "id_res")
    _ensure_sequence("abonnement", "id_abon")
    _ensure_sequence("paiement", "id_paiement")
    _ensure_sequence("feedback", "id_feed")
    _ensure_sequence("detection_ia", "id_detect")


def downgrade():
    _drop_sequence_default("detection_ia", "id_detect")
    _drop_sequence_default("feedback", "id_feed")
    _drop_sequence_default("paiement", "id_paiement")
    _drop_sequence_default("abonnement", "id_abon")
    _drop_sequence_default("reservation", "id_res")
    _drop_sequence_default("vehicule", "id_veh")
    _drop_sequence_default("place", "id_place")
    _drop_sequence_default("parking", "id_park")
    _drop_sequence_default("comptes", "id_compte")

"""enrich etage and backfill existing places

Revision ID: a5b9c3d8e412
Revises: 9f1c4d2b7e11
Create Date: 2026-04-18 00:30:00.000000
"""

from collections import defaultdict

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "a5b9c3d8e412"
down_revision = "9f1c4d2b7e11"
branch_labels = None
depends_on = None


def _normalize_floor_name(raw_value):
    value = (raw_value or "").strip()
    return value or "RDC"


def upgrade():
    with op.batch_alter_table("etage", schema=None) as batch_op:
        batch_op.add_column(sa.Column("code", sa.String(length=50), nullable=True))
        batch_op.add_column(sa.Column("description", sa.Text(), nullable=True))
        batch_op.add_column(sa.Column("total_places", sa.Integer(), nullable=False, server_default="0"))
        batch_op.create_check_constraint("ck_etage_total_places_positive", "total_places >= 0")
        batch_op.create_unique_constraint("uq_etage_parking_code", ["parking_id", "code"])

    connection = op.get_bind()
    place_rows = connection.execute(
        sa.text(
            """
            SELECT id_place, parking_id, etage
            FROM place
            ORDER BY parking_id, num_place, id_place
            """
        )
    ).fetchall()

    grouped_places = defaultdict(list)
    for row in place_rows:
        grouped_places[int(row.parking_id)].append(row)

    for parking_id, rows in grouped_places.items():
        floors = defaultdict(list)
        for row in rows:
            floors[_normalize_floor_name(row.etage)].append(int(row.id_place))

        for order, floor_name in enumerate(sorted(floors.keys())):
            code = f"P{parking_id}-E{order + 1}"
            total_places = len(floors[floor_name])
            description = f"Etage {floor_name} du parking {parking_id}"

            result = connection.execute(
                sa.text(
                    """
                    INSERT INTO etage (parking_id, nom, code, ordre, description, total_places)
                    VALUES (:parking_id, :nom, :code, :ordre, :description, :total_places)
                    """
                ),
                {
                    "parking_id": parking_id,
                    "nom": floor_name,
                    "code": code,
                    "ordre": order,
                    "description": description,
                    "total_places": total_places,
                },
            )

            if hasattr(result, "lastrowid") and result.lastrowid is not None:
                etage_id = result.lastrowid
            else:
                etage_id = connection.execute(
                    sa.text(
                        """
                        SELECT id_etage FROM etage
                        WHERE parking_id = :parking_id AND nom = :nom
                        """
                    ),
                    {"parking_id": parking_id, "nom": floor_name},
                ).scalar_one()

            connection.execute(
                sa.text(
                    """
                    UPDATE place
                    SET etage_id = :etage_id
                    WHERE parking_id = :parking_id
                      AND COALESCE(NULLIF(TRIM(etage), ''), 'RDC') = :floor_name
                    """
                ),
                {
                    "etage_id": etage_id,
                    "parking_id": parking_id,
                    "floor_name": floor_name,
                },
            )


def downgrade():
    with op.batch_alter_table("etage", schema=None) as batch_op:
        batch_op.drop_constraint("uq_etage_parking_code", type_="unique")
        batch_op.drop_constraint("ck_etage_total_places_positive", type_="check")
        batch_op.drop_column("total_places")
        batch_op.drop_column("description")
        batch_op.drop_column("code")

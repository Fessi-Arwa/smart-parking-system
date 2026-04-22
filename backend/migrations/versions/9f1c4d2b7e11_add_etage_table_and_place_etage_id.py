"""add etage table and place etage_id

Revision ID: 9f1c4d2b7e11
Revises: 8f3c1f2a7b91
Create Date: 2026-04-18 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "9f1c4d2b7e11"
down_revision = "8f3c1f2a7b91"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "etage",
        sa.Column("id_etage", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("parking_id", sa.BigInteger(), sa.ForeignKey("parking.id_park", ondelete="CASCADE"), nullable=False),
        sa.Column("nom", sa.String(length=100), nullable=False),
        sa.Column("ordre", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.CheckConstraint("ordre >= 0", name="ck_etage_ordre_positive"),
        sa.UniqueConstraint("parking_id", "nom", name="uq_etage_parking_nom"),
        sa.UniqueConstraint("parking_id", "ordre", name="uq_etage_parking_ordre"),
    )
    op.create_index("idx_etage_parking_id", "etage", ["parking_id"], unique=False)

    with op.batch_alter_table("place", schema=None) as batch_op:
        batch_op.add_column(sa.Column("etage_id", sa.BigInteger(), nullable=True))
        batch_op.create_foreign_key(
            "fk_place_etage_id",
            "etage",
            ["etage_id"],
            ["id_etage"],
            ondelete="SET NULL",
        )

    op.create_index("idx_place_etage_id", "place", ["etage_id"], unique=False)


def downgrade():
    op.drop_index("idx_place_etage_id", table_name="place")

    with op.batch_alter_table("place", schema=None) as batch_op:
        batch_op.drop_constraint("fk_place_etage_id", type_="foreignkey")
        batch_op.drop_column("etage_id")

    op.drop_index("idx_etage_parking_id", table_name="etage")
    op.drop_table("etage")

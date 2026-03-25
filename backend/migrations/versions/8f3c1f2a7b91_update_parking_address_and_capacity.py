"""update parking address and capacity

Revision ID: 8f3c1f2a7b91
Revises: 1a6005f244e2
Create Date: 2026-03-25 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "8f3c1f2a7b91"
down_revision = "1a6005f244e2"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("parking", schema=None) as batch_op:
        batch_op.add_column(sa.Column("capacite", sa.Integer(), nullable=False, server_default="0"))
        batch_op.create_check_constraint("ck_parking_capacite_positive", "capacite >= 0")
        batch_op.drop_column("ville")
        batch_op.drop_column("latitude")
        batch_op.drop_column("longitude")


def downgrade():
    with op.batch_alter_table("parking", schema=None) as batch_op:
        batch_op.add_column(sa.Column("longitude", sa.Float(), nullable=False, server_default="0"))
        batch_op.add_column(sa.Column("latitude", sa.Float(), nullable=False, server_default="0"))
        batch_op.add_column(sa.Column("ville", sa.String(length=100), nullable=False, server_default=""))
        batch_op.drop_constraint("ck_parking_capacite_positive", type_="check")
        batch_op.drop_column("capacite")

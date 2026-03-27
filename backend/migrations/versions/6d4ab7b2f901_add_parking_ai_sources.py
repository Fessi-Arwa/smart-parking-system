"""add parking ai sources

Revision ID: 6d4ab7b2f901
Revises: 3c2f7d9a1b55
Create Date: 2026-03-27 18:20:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision = "6d4ab7b2f901"
down_revision = "3c2f7d9a1b55"
branch_labels = None
depends_on = None


type_source_ia = sa.Enum("image", "video", "camera", name="type_source_ia")
type_source_ia_existing = postgresql.ENUM(
    "image",
    "video",
    "camera",
    name="type_source_ia",
    create_type=False,
)


def upgrade():
    bind = op.get_bind()
    type_source_ia.create(bind, checkfirst=True)

    op.create_table(
        "parking_ai_source",
        sa.Column("id_source", sa.BigInteger(), primary_key=True),
        sa.Column("parking_id", sa.BigInteger(), nullable=False),
        sa.Column("source_type", type_source_ia_existing, nullable=False),
        sa.Column("label", sa.String(length=150), nullable=True),
        sa.Column("file_path", sa.Text(), nullable=True),
        sa.Column("original_name", sa.String(length=255), nullable=True),
        sa.Column("mime_type", sa.String(length=120), nullable=True),
        sa.Column("stream_url", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["parking_id"], ["parking.id_park"], ondelete="CASCADE"),
    )
    op.create_index("idx_parking_ai_source_parking_id", "parking_ai_source", ["parking_id"], unique=False)


def downgrade():
    op.drop_index("idx_parking_ai_source_parking_id", table_name="parking_ai_source")
    op.drop_table("parking_ai_source")
    bind = op.get_bind()
    type_source_ia.drop(bind, checkfirst=True)

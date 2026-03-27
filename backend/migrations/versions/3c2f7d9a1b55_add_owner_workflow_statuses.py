"""add owner workflow statuses

Revision ID: 3c2f7d9a1b55
Revises: 8f3c1f2a7b91
Create Date: 2026-03-27 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "3c2f7d9a1b55"
down_revision = "8f3c1f2a7b91"
branch_labels = None
depends_on = None


owner_status_enum = sa.Enum(
    "en_attente",
    "accepte",
    "refuse",
    "suspendu",
    name="statut_validation_owner",
)
parking_validation_enum = sa.Enum(
    "brouillon",
    "en_attente_validation",
    "valide",
    "rejete",
    name="statut_validation_parking",
)
parking_setup_enum = sa.Enum(
    "non_commencee",
    "en_cours",
    "terminee",
    name="statut_configuration_parking",
)
parking_ai_setup_enum = sa.Enum(
    "non_configuree",
    "en_cours",
    "testee",
    "active",
    name="statut_configuration_ia",
)


def upgrade():
    bind = op.get_bind()
    owner_status_enum.create(bind, checkfirst=True)
    parking_validation_enum.create(bind, checkfirst=True)
    parking_setup_enum.create(bind, checkfirst=True)
    parking_ai_setup_enum.create(bind, checkfirst=True)

    with op.batch_alter_table("comptes", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column(
                "owner_status",
                owner_status_enum,
                nullable=False,
                server_default="en_attente",
            )
        )

    with op.batch_alter_table("parking", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column(
                "validation_status",
                parking_validation_enum,
                nullable=False,
                server_default="brouillon",
            )
        )
        batch_op.add_column(
            sa.Column(
                "setup_status",
                parking_setup_enum,
                nullable=False,
                server_default="non_commencee",
            )
        )
        batch_op.add_column(
            sa.Column(
                "ai_setup_status",
                parking_ai_setup_enum,
                nullable=False,
                server_default="non_configuree",
            )
        )

    op.execute(
        "UPDATE comptes SET owner_status = 'accepte'::statut_validation_owner"
    )
    op.execute(
        "UPDATE comptes SET owner_status = 'en_attente'::statut_validation_owner WHERE role = 'owner'"
    )
    op.execute(
        """
        UPDATE parking
        SET validation_status = 'en_attente_validation'::statut_validation_parking,
            setup_status = 'non_commencee'::statut_configuration_parking,
            ai_setup_status = 'non_configuree'::statut_configuration_ia
        """
    )


def downgrade():
    with op.batch_alter_table("parking", schema=None) as batch_op:
        batch_op.drop_column("ai_setup_status")
        batch_op.drop_column("setup_status")
        batch_op.drop_column("validation_status")

    with op.batch_alter_table("comptes", schema=None) as batch_op:
        batch_op.drop_column("owner_status")

    bind = op.get_bind()
    parking_ai_setup_enum.drop(bind, checkfirst=True)
    parking_setup_enum.drop(bind, checkfirst=True)
    parking_validation_enum.drop(bind, checkfirst=True)
    owner_status_enum.drop(bind, checkfirst=True)

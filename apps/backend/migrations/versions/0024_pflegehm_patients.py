"""create pflegehm_patients table

Revision ID: 0024
Revises: 0023
Create Date: 2026-04-15
"""

from alembic import op
import sqlalchemy as sa

revision = "0024"
down_revision = "0023"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "pflegehm_patients",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("versichertennummer", sa.String(50), nullable=False),
        sa.Column("geburtsdatum", sa.Date(), nullable=True),
        sa.Column("address", sa.Text(), nullable=True),
        sa.Column(
            "kasse_id",
            sa.Integer(),
            sa.ForeignKey("kostentraeger.id"),
            nullable=True,
        ),
        sa.Column("unterschriebener_antrag", sa.String(255), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )


def downgrade() -> None:
    op.drop_table("pflegehm_patients")

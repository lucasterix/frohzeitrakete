"""add leistungsnachweis_path to pflegehm_abrechnungen

Revision ID: 0027
Revises: 0026
Create Date: 2026-04-15
"""

from alembic import op
import sqlalchemy as sa

revision = "0027"
down_revision = "0026"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "pflegehm_abrechnungen",
        sa.Column("leistungsnachweis_path", sa.String(500), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("pflegehm_abrechnungen", "leistungsnachweis_path")

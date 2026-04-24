"""add pflegehm_patient_id FK to pflegehm_abrechnungen

Revision ID: 0026
Revises: 0025
Create Date: 2026-04-15
"""

from alembic import op
import sqlalchemy as sa

revision = "0026"
down_revision = "0025"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "pflegehm_abrechnungen",
        sa.Column(
            "pflegehm_patient_id",
            sa.Integer(),
            sa.ForeignKey("pflegehm_patients.id"),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column("pflegehm_abrechnungen", "pflegehm_patient_id")

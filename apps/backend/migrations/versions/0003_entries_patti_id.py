"""add patti_service_entry_id to entries

Revision ID: 0003
Revises: 0002
Create Date: 2026-04-14
"""

from alembic import op
import sqlalchemy as sa

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "entries",
        sa.Column("patti_service_entry_id", sa.Integer(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("entries", "patti_service_entry_id")

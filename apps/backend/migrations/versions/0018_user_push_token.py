"""add push_token columns to users

Revision ID: 0018
Revises: 0017
Create Date: 2026-04-15
"""

from alembic import op
import sqlalchemy as sa

revision = "0018"
down_revision = "0017"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("push_token", sa.String(length=512), nullable=True),
    )
    op.add_column(
        "users",
        sa.Column("push_platform", sa.String(length=20), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("users", "push_platform")
    op.drop_column("users", "push_token")

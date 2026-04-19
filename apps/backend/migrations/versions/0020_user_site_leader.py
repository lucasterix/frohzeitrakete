"""add site_leader_id to users

Revision ID: 0020
Revises: 0019
Create Date: 2026-04-15
"""

from alembic import op
import sqlalchemy as sa

revision = "0020"
down_revision = "0019"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("site_leader_id", sa.Integer(), nullable=True),
    )
    op.create_foreign_key(
        "fk_users_site_leader_id",
        "users",
        "users",
        ["site_leader_id"],
        ["id"],
    )


def downgrade() -> None:
    op.drop_constraint("fk_users_site_leader_id", "users", type_="foreignkey")
    op.drop_column("users", "site_leader_id")

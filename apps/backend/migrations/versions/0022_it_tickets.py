"""create it_tickets table

Revision ID: 0022
Revises: 0021
Create Date: 2026-04-15
"""

from alembic import op
import sqlalchemy as sa

revision = "0022"
down_revision = "0021"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "it_tickets",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "user_id",
            sa.Integer(),
            sa.ForeignKey("users.id"),
            nullable=False,
            index=True,
        ),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("category", sa.String(50), nullable=False, server_default="bug"),
        sa.Column("status", sa.String(30), nullable=False, server_default="open"),
        sa.Column("priority", sa.String(20), nullable=False, server_default="medium"),
        sa.Column("response_text", sa.Text(), nullable=True),
        sa.Column(
            "handler_user_id",
            sa.Integer(),
            sa.ForeignKey("users.id"),
            nullable=True,
        ),
        sa.Column("handled_at", sa.DateTime(), nullable=True),
        sa.Column("device_info", sa.Text(), nullable=True),
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
    op.drop_table("it_tickets")

"""create mail_entries table

Revision ID: 0031
Revises: 0030
Create Date: 2026-04-15
"""

from alembic import op
import sqlalchemy as sa

revision = "0031"
down_revision = "0030"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "mail_entries",
        sa.Column("id", sa.Integer, primary_key=True, index=True),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("sender", sa.String(255), nullable=True),
        sa.Column("received_date", sa.String(10), nullable=False),
        sa.Column("scan_path", sa.String(255), nullable=True),
        sa.Column("department", sa.String(50), nullable=False, index=True),
        sa.Column("priority", sa.String(20), nullable=False, server_default="medium"),
        sa.Column("ai_classification", sa.Text, nullable=True),
        sa.Column("status", sa.String(30), nullable=False, server_default="eingegangen"),
        sa.Column(
            "assigned_to_user_id",
            sa.Integer,
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "handler_user_id",
            sa.Integer,
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("handled_at", sa.DateTime, nullable=True),
        sa.Column("handler_note", sa.Text, nullable=True),
        sa.Column(
            "created_by_user_id",
            sa.Integer,
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=False,
        ),
        sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("mail_entries")

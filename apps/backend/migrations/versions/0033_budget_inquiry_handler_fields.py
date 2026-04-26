"""add handler fields to budget_inquiries

Revision ID: 0033
Revises: 0032
Create Date: 2026-04-15
"""

from alembic import op
import sqlalchemy as sa

revision = "0033"
down_revision = "0032"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "budget_inquiries",
        sa.Column("handler_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
    )
    op.add_column(
        "budget_inquiries",
        sa.Column("handled_at", sa.DateTime(), nullable=True),
    )
    op.add_column(
        "budget_inquiries",
        sa.Column("handler_note", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("budget_inquiries", "handler_note")
    op.drop_column("budget_inquiries", "handled_at")
    op.drop_column("budget_inquiries", "handler_user_id")

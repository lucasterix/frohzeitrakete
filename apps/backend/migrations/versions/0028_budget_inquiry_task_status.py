"""add task_status to budget_inquiries

Revision ID: 0028
Revises: 0027
Create Date: 2026-04-15
"""

from alembic import op
import sqlalchemy as sa

revision = "0028"
down_revision = "0027"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "budget_inquiries",
        sa.Column(
            "task_status",
            sa.String(20),
            nullable=False,
            server_default="pending",
        ),
    )


def downgrade() -> None:
    op.drop_column("budget_inquiries", "task_status")

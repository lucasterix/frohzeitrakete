"""create applicants table

Revision ID: 0034
Revises: 0033
Create Date: 2026-04-26
"""

from alembic import op
import sqlalchemy as sa

revision = "0034"
down_revision = "0033"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "applicants",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("phone", sa.String(100), nullable=True),
        sa.Column("position", sa.String(255), nullable=False),
        sa.Column("source", sa.String(100), nullable=True),
        sa.Column("status", sa.String(50), nullable=False, server_default="eingegangen"),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("handler_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("interview_date", sa.DateTime(), nullable=True),
        sa.Column("rejection_reason", sa.Text(), nullable=True),
        sa.Column("resume_path", sa.String(500), nullable=True),
        sa.Column("created_by_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_applicants_status", "applicants", ["status"])


def downgrade() -> None:
    op.drop_index("ix_applicants_status")
    op.drop_table("applicants")

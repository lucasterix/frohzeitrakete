"""create payroll_entries table

Revision ID: 0029
Revises: 0028
Create Date: 2026-04-15
"""

from alembic import op
import sqlalchemy as sa

revision = "0029"
down_revision = "0028"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "payroll_entries",
        sa.Column("id", sa.Integer, primary_key=True, index=True),
        sa.Column(
            "user_id",
            sa.Integer,
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
            index=True,
        ),
        sa.Column("employee_name", sa.String(255), nullable=True),
        sa.Column("category", sa.String(50), nullable=False, index=True),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("from_date", sa.Date, nullable=True),
        sa.Column("to_date", sa.Date, nullable=True),
        sa.Column("attachment_path", sa.String(255), nullable=True),
        sa.Column("source", sa.String(30), nullable=False, server_default="admin_web"),
        sa.Column("status", sa.String(30), nullable=False, server_default="open", index=True),
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
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("payroll_entries")

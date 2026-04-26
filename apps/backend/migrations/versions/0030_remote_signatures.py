"""create remote_signatures table

Revision ID: 0030
Revises: 0029
Create Date: 2026-04-15
"""

from alembic import op
import sqlalchemy as sa

revision = "0030"
down_revision = "0029"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "remote_signatures",
        sa.Column("id", sa.Integer, primary_key=True, index=True),
        sa.Column("token", sa.String(64), unique=True, index=True, nullable=False),
        sa.Column("patient_id", sa.Integer, nullable=False, index=True),
        sa.Column("patient_name", sa.String(255), nullable=False),
        sa.Column(
            "user_id",
            sa.Integer,
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "entry_id",
            sa.Integer,
            sa.ForeignKey("entries.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("document_type", sa.String(50), nullable=False),
        sa.Column("description", sa.Text, nullable=False),
        sa.Column("status", sa.String(30), nullable=False, server_default="pending"),
        sa.Column(
            "signature_event_id",
            sa.Integer,
            sa.ForeignKey("signature_events.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("expires_at", sa.DateTime, nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime,
            nullable=False,
            server_default=sa.func.now(),
        ),
    )


def downgrade() -> None:
    op.drop_table("remote_signatures")

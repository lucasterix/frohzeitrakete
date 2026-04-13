"""initial schema

Revision ID: 0001
Revises:
Create Date: 2026-04-13

NOTE: On the Hetzner server (where tables already exist via create_all),
run `alembic stamp head` instead of `alembic upgrade head` to mark this
migration as applied without re-executing the DDL.
"""

from alembic import op
import sqlalchemy as sa

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column("full_name", sa.String(length=255), nullable=False),
        sa.Column("role", sa.String(length=50), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("patti_person_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_users_email"), "users", ["email"], unique=True)
    op.create_index(op.f("ix_users_id"), "users", ["id"], unique=False)

    op.create_table(
        "refresh_tokens",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("token_hash", sa.String(length=255), nullable=False),
        sa.Column("device_label", sa.String(length=255), nullable=True),
        sa.Column("user_agent", sa.Text(), nullable=True),
        sa.Column("ip_address", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("last_used_at", sa.DateTime(), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("revoked_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_refresh_tokens_id"), "refresh_tokens", ["id"], unique=False)
    op.create_index(op.f("ix_refresh_tokens_token_hash"), "refresh_tokens", ["token_hash"], unique=True)
    op.create_index(op.f("ix_refresh_tokens_user_id"), "refresh_tokens", ["user_id"], unique=False)

    op.create_table(
        "signature_events",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("patient_id", sa.Integer(), nullable=False),
        sa.Column("document_type", sa.String(length=50), nullable=False),
        sa.Column("status", sa.String(length=30), nullable=False),
        sa.Column("signer_name", sa.String(length=255), nullable=False),
        sa.Column("info_text_version", sa.String(length=50), nullable=True),
        sa.Column("source", sa.String(length=30), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("created_by_user_id", sa.Integer(), nullable=True),
        sa.Column("signed_at", sa.DateTime(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_signature_events_document_type"), "signature_events", ["document_type"], unique=False)
    op.create_index(op.f("ix_signature_events_id"), "signature_events", ["id"], unique=False)
    op.create_index(op.f("ix_signature_events_patient_id"), "signature_events", ["patient_id"], unique=False)
    op.create_index(op.f("ix_signature_events_signed_at"), "signature_events", ["signed_at"], unique=False)

    op.create_table(
        "signature_assets",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("signature_event_id", sa.Integer(), nullable=False),
        sa.Column("svg_content", sa.Text(), nullable=False),
        sa.Column("width", sa.Integer(), nullable=True),
        sa.Column("height", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["signature_event_id"], ["signature_events.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("signature_event_id"),
    )
    op.create_index(op.f("ix_signature_assets_id"), "signature_assets", ["id"], unique=False)
    op.create_index(op.f("ix_signature_assets_signature_event_id"), "signature_assets", ["signature_event_id"], unique=False)


def downgrade() -> None:
    op.drop_table("signature_assets")
    op.drop_table("signature_events")
    op.drop_table("refresh_tokens")
    op.drop_table("users")

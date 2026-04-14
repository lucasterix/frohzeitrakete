"""add patient_extras and call_requests tables

Revision ID: 0004
Revises: 0003
Create Date: 2026-04-14
"""

from alembic import op
import sqlalchemy as sa

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "patient_extras",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("patient_id", sa.Integer(), nullable=False),
        sa.Column("emergency_contact_name", sa.String(length=255), nullable=True),
        sa.Column("emergency_contact_phone", sa.String(length=100), nullable=True),
        sa.Column("contract_signed_at", sa.DateTime(), nullable=True),
        sa.Column("contract_signature_event_id", sa.Integer(), nullable=True),
        sa.Column("last_office_call_at", sa.DateTime(), nullable=True),
        sa.Column("primary_caretaker_changed_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(
            ["contract_signature_event_id"],
            ["signature_events.id"],
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("patient_id"),
    )
    op.create_index(
        op.f("ix_patient_extras_id"), "patient_extras", ["id"], unique=False
    )
    op.create_index(
        op.f("ix_patient_extras_patient_id"),
        "patient_extras",
        ["patient_id"],
        unique=False,
    )

    op.create_table(
        "call_requests",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("patient_id", sa.Integer(), nullable=False),
        sa.Column("requested_by_user_id", sa.Integer(), nullable=True),
        sa.Column("reason", sa.String(length=50), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("handled_at", sa.DateTime(), nullable=True),
        sa.Column("handled_by_user_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(
            ["requested_by_user_id"], ["users.id"], ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(
            ["handled_by_user_id"], ["users.id"], ondelete="SET NULL"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_call_requests_id"), "call_requests", ["id"], unique=False
    )
    op.create_index(
        op.f("ix_call_requests_patient_id"),
        "call_requests",
        ["patient_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_call_requests_status"),
        "call_requests",
        ["status"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_call_requests_status"), table_name="call_requests")
    op.drop_index(op.f("ix_call_requests_patient_id"), table_name="call_requests")
    op.drop_index(op.f("ix_call_requests_id"), table_name="call_requests")
    op.drop_table("call_requests")
    op.drop_index(
        op.f("ix_patient_extras_patient_id"), table_name="patient_extras"
    )
    op.drop_index(op.f("ix_patient_extras_id"), table_name="patient_extras")
    op.drop_table("patient_extras")

"""add patient_intake_requests table

Revision ID: 0008
Revises: 0007
Create Date: 2026-04-14
"""

from alembic import op
import sqlalchemy as sa

revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "patient_intake_requests",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("requested_by_user_id", sa.Integer(), nullable=True),
        sa.Column("full_name", sa.String(length=255), nullable=False),
        sa.Column("birthdate", sa.String(length=20), nullable=True),
        sa.Column("address", sa.String(length=500), nullable=True),
        sa.Column("phone", sa.String(length=100), nullable=True),
        sa.Column("contact_person", sa.String(length=255), nullable=True),
        sa.Column("care_level", sa.String(length=30), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("handled_by_user_id", sa.Integer(), nullable=True),
        sa.Column("handled_at", sa.DateTime(), nullable=True),
        sa.Column("patti_patient_id", sa.Integer(), nullable=True),
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
        op.f("ix_patient_intake_requests_id"),
        "patient_intake_requests",
        ["id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_patient_intake_requests_status"),
        "patient_intake_requests",
        ["status"],
        unique=False,
    )
    op.create_index(
        op.f("ix_patient_intake_requests_created_at"),
        "patient_intake_requests",
        ["created_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_patient_intake_requests_created_at"),
        table_name="patient_intake_requests",
    )
    op.drop_index(
        op.f("ix_patient_intake_requests_status"),
        table_name="patient_intake_requests",
    )
    op.drop_index(
        op.f("ix_patient_intake_requests_id"),
        table_name="patient_intake_requests",
    )
    op.drop_table("patient_intake_requests")

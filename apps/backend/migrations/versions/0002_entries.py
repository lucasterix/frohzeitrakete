"""add entries table

Revision ID: 0002
Revises: 0001
Create Date: 2026-04-13
"""

from alembic import op
import sqlalchemy as sa

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "entries",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("patient_id", sa.Integer(), nullable=False),
        sa.Column("entry_date", sa.Date(), nullable=False),
        sa.Column("hours", sa.Float(), nullable=False),
        sa.Column("activities", sa.String(length=500), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("signature_event_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["signature_event_id"],
            ["signature_events.id"],
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "user_id",
            "patient_id",
            "entry_date",
            name="uq_entries_user_patient_date",
        ),
    )
    op.create_index(op.f("ix_entries_id"), "entries", ["id"], unique=False)
    op.create_index(
        op.f("ix_entries_user_id"), "entries", ["user_id"], unique=False
    )
    op.create_index(
        op.f("ix_entries_patient_id"), "entries", ["patient_id"], unique=False
    )
    op.create_index(
        op.f("ix_entries_entry_date"), "entries", ["entry_date"], unique=False
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_entries_entry_date"), table_name="entries")
    op.drop_index(op.f("ix_entries_patient_id"), table_name="entries")
    op.drop_index(op.f("ix_entries_user_id"), table_name="entries")
    op.drop_index(op.f("ix_entries_id"), table_name="entries")
    op.drop_table("entries")

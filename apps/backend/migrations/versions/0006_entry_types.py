"""entries: add entry_type, category_label, patient_id nullable

Revision ID: 0006
Revises: 0005
Create Date: 2026-04-14
"""

from alembic import op
import sqlalchemy as sa

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. patient_id nullable machen
    op.alter_column(
        "entries",
        "patient_id",
        existing_type=sa.Integer(),
        nullable=True,
    )
    # 2. Neue Spalten
    op.add_column(
        "entries",
        sa.Column(
            "entry_type",
            sa.String(length=20),
            nullable=False,
            server_default="patient",
        ),
    )
    op.add_column(
        "entries",
        sa.Column("category_label", sa.String(length=255), nullable=True),
    )
    op.create_index(
        op.f("ix_entries_entry_type"), "entries", ["entry_type"], unique=False
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_entries_entry_type"), table_name="entries")
    op.drop_column("entries", "category_label")
    op.drop_column("entries", "entry_type")
    op.alter_column(
        "entries",
        "patient_id",
        existing_type=sa.Integer(),
        nullable=False,
    )

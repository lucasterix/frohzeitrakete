"""add office_processed_* columns to signature_events

Revision ID: 0015
Revises: 0014
Create Date: 2026-04-15
"""

from alembic import op
import sqlalchemy as sa

revision = "0015"
down_revision = "0014"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "signature_events",
        sa.Column("office_processed_at", sa.DateTime(), nullable=True),
    )
    op.add_column(
        "signature_events",
        sa.Column(
            "office_processed_by_user_id", sa.Integer(), nullable=True
        ),
    )
    op.create_foreign_key(
        "fk_signature_events_office_processed_by",
        "signature_events",
        "users",
        ["office_processed_by_user_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint(
        "fk_signature_events_office_processed_by",
        "signature_events",
        type_="foreignkey",
    )
    op.drop_column("signature_events", "office_processed_by_user_id")
    op.drop_column("signature_events", "office_processed_at")

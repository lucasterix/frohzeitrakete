"""widen handler_kuerzel columns to hold full first names

Revision ID: 0013
Revises: 0012
Create Date: 2026-04-14
"""

from alembic import op
import sqlalchemy as sa

revision = "0013"
down_revision = "0012"
branch_labels = None
depends_on = None


def upgrade() -> None:
    for table in (
        "users",
        "call_requests",
        "patient_intake_requests",
        "vacation_requests",
        "sick_leaves",
        "hr_requests",
    ):
        col = "initials" if table == "users" else "handler_kuerzel"
        op.alter_column(
            table,
            col,
            existing_type=sa.String(length=10),
            type_=sa.String(length=50),
            existing_nullable=True,
        )


def downgrade() -> None:
    for table in (
        "users",
        "call_requests",
        "patient_intake_requests",
        "vacation_requests",
        "sick_leaves",
        "hr_requests",
    ):
        col = "initials" if table == "users" else "handler_kuerzel"
        op.alter_column(
            table,
            col,
            existing_type=sa.String(length=50),
            type_=sa.String(length=10),
            existing_nullable=True,
        )

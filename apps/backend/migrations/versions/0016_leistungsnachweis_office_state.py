"""add leistungsnachweis_office_state table

Revision ID: 0016
Revises: 0015
Create Date: 2026-04-15
"""

from alembic import op
import sqlalchemy as sa

revision = "0016"
down_revision = "0015"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "leistungsnachweis_office_state",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("patient_id", sa.Integer(), nullable=False),
        sa.Column("year", sa.Integer(), nullable=False),
        sa.Column("month", sa.Integer(), nullable=False),
        sa.Column("processed_at", sa.DateTime(), nullable=True),
        sa.Column(
            "processed_by_user_id", sa.Integer(), nullable=True
        ),
        sa.Column(
            "created_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["processed_by_user_id"], ["users.id"], ondelete="SET NULL"
        ),
        sa.UniqueConstraint(
            "user_id",
            "patient_id",
            "year",
            "month",
            name="uq_lnos_user_patient_month",
        ),
    )
    op.create_index(
        "ix_lnos_year_month",
        "leistungsnachweis_office_state",
        ["year", "month"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_lnos_year_month", table_name="leistungsnachweis_office_state"
    )
    op.drop_table("leistungsnachweis_office_state")

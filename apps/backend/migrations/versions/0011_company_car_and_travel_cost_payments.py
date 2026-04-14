"""add has_company_car to users + travel_cost_payments table

Revision ID: 0011
Revises: 0010
Create Date: 2026-04-14
"""

from alembic import op
import sqlalchemy as sa

revision = "0011"
down_revision = "0010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "has_company_car",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )
    op.alter_column("users", "has_company_car", server_default=None)

    op.create_table(
        "travel_cost_payments",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("from_date", sa.Date(), nullable=False),
        sa.Column("to_date", sa.Date(), nullable=False),
        sa.Column("marked_by_user_id", sa.Integer(), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["marked_by_user_id"], ["users.id"], ondelete="SET NULL"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_travel_cost_payments_id"),
        "travel_cost_payments",
        ["id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_travel_cost_payments_user_id"),
        "travel_cost_payments",
        ["user_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_travel_cost_payments_user_id"),
        table_name="travel_cost_payments",
    )
    op.drop_index(
        op.f("ix_travel_cost_payments_id"),
        table_name="travel_cost_payments",
    )
    op.drop_table("travel_cost_payments")
    op.drop_column("users", "has_company_car")

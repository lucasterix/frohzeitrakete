"""add trainings table

Revision ID: 0010
Revises: 0009
Create Date: 2026-04-14
"""

from alembic import op
import sqlalchemy as sa

revision = "0010"
down_revision = "0009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "trainings",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("location", sa.String(length=255), nullable=True),
        sa.Column("starts_at", sa.DateTime(), nullable=False),
        sa.Column("ends_at", sa.DateTime(), nullable=True),
        sa.Column("created_by_user_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(
            ["created_by_user_id"], ["users.id"], ondelete="SET NULL"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_trainings_id"), "trainings", ["id"], unique=False)
    op.create_index(
        op.f("ix_trainings_starts_at"), "trainings", ["starts_at"], unique=False
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_trainings_starts_at"), table_name="trainings")
    op.drop_index(op.f("ix_trainings_id"), table_name="trainings")
    op.drop_table("trainings")

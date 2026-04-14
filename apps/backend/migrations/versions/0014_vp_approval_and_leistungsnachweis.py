"""add approved_by_kk to signature_events + leistungsnachweis_exports table

Revision ID: 0014
Revises: 0013
Create Date: 2026-04-14
"""

from alembic import op
import sqlalchemy as sa

revision = "0014"
down_revision = "0013"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "signature_events",
        sa.Column(
            "approved_by_kk",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )
    op.alter_column("signature_events", "approved_by_kk", server_default=None)

    op.add_column(
        "signature_events",
        sa.Column("approved_at", sa.DateTime(), nullable=True),
    )
    op.add_column(
        "signature_events",
        sa.Column("approved_note", sa.Text(), nullable=True),
    )

    op.create_table(
        "leistungsnachweis_exports",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("patient_id", sa.Integer(), nullable=False),
        sa.Column("year", sa.Integer(), nullable=False),
        sa.Column("month", sa.Integer(), nullable=False),
        sa.Column("total_hours", sa.Float(), nullable=False),
        sa.Column("total_km", sa.Float(), nullable=False),
        sa.Column("pdf_path", sa.String(length=500), nullable=True),
        sa.Column("generated_by_user_id", sa.Integer(), nullable=True),
        sa.Column("generated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["generated_by_user_id"], ["users.id"], ondelete="SET NULL"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_leistungsnachweis_exports_user_id"),
        "leistungsnachweis_exports",
        ["user_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_leistungsnachweis_exports_patient_id"),
        "leistungsnachweis_exports",
        ["patient_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_leistungsnachweis_exports_patient_id"),
        table_name="leistungsnachweis_exports",
    )
    op.drop_index(
        op.f("ix_leistungsnachweis_exports_user_id"),
        table_name="leistungsnachweis_exports",
    )
    op.drop_table("leistungsnachweis_exports")
    op.drop_column("signature_events", "approved_note")
    op.drop_column("signature_events", "approved_at")
    op.drop_column("signature_events", "approved_by_kk")

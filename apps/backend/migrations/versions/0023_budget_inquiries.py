"""create budget_inquiries table

Revision ID: 0023
Revises: 0022
Create Date: 2026-04-15
"""

from alembic import op
import sqlalchemy as sa

revision = "0023"
down_revision = "0022"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "budget_inquiries",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("patient_id", sa.Integer(), nullable=False, index=True),
        sa.Column("patient_name", sa.String(255), nullable=False),
        sa.Column("versichertennummer", sa.String(100), nullable=True),
        sa.Column("geburtsdatum", sa.String(20), nullable=True),
        sa.Column("kasse_name", sa.String(255), nullable=True),
        sa.Column("kasse_ik", sa.String(50), nullable=True),
        sa.Column(
            "user_id",
            sa.Integer(),
            sa.ForeignKey("users.id"),
            nullable=False,
            index=True,
        ),
        sa.Column("pdf_path", sa.Text(), nullable=True),
        sa.Column(
            "signature_event_id",
            sa.Integer(),
            sa.ForeignKey("signature_events.id"),
            nullable=True,
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
    )


def downgrade() -> None:
    op.drop_table("budget_inquiries")

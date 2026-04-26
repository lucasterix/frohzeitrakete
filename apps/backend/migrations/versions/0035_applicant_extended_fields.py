"""extend applicants with hiring pipeline fields

Revision ID: 0035
Revises: 0034
Create Date: 2026-04-26
"""

from alembic import op
import sqlalchemy as sa

revision = "0035"
down_revision = "0034"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("applicants", sa.Column("desired_hours", sa.Float(), nullable=True))
    op.add_column("applicants", sa.Column("desired_location", sa.String(255), nullable=True))
    op.add_column("applicants", sa.Column("desired_role", sa.String(255), nullable=True))
    op.add_column("applicants", sa.Column("available_from", sa.String(10), nullable=True))
    op.add_column("applicants", sa.Column("has_drivers_license", sa.Boolean(), nullable=True))
    op.add_column("applicants", sa.Column("has_experience", sa.Boolean(), nullable=True))
    op.add_column("applicants", sa.Column("experience_note", sa.Text(), nullable=True))

    op.add_column("applicants", sa.Column("trial_work_date", sa.DateTime(), nullable=True))
    op.add_column("applicants", sa.Column("criminal_record_requested_at", sa.DateTime(), nullable=True))
    op.add_column("applicants", sa.Column("criminal_record_received_at", sa.DateTime(), nullable=True))
    op.add_column("applicants", sa.Column("hired_at", sa.DateTime(), nullable=True))
    op.add_column("applicants", sa.Column("hired_hours", sa.Float(), nullable=True))
    op.add_column("applicants", sa.Column("hired_location", sa.String(255), nullable=True))
    op.add_column("applicants", sa.Column("hired_role", sa.String(255), nullable=True))
    op.add_column("applicants", sa.Column("contract_sent_at", sa.DateTime(), nullable=True))
    op.add_column("applicants", sa.Column("start_date", sa.String(10), nullable=True))

    op.add_column("applicants", sa.Column("confirmation_sent_at", sa.DateTime(), nullable=True))
    op.add_column("applicants", sa.Column("invitation_sent_at", sa.DateTime(), nullable=True))
    op.add_column("applicants", sa.Column("rejection_sent_at", sa.DateTime(), nullable=True))
    op.add_column("applicants", sa.Column("offer_sent_at", sa.DateTime(), nullable=True))


def downgrade() -> None:
    for col in [
        "desired_hours", "desired_location", "desired_role", "available_from",
        "has_drivers_license", "has_experience", "experience_note",
        "trial_work_date", "criminal_record_requested_at", "criminal_record_received_at",
        "hired_at", "hired_hours", "hired_location", "hired_role",
        "contract_sent_at", "start_date",
        "confirmation_sent_at", "invitation_sent_at", "rejection_sent_at", "offer_sent_at",
    ]:
        op.drop_column("applicants", col)

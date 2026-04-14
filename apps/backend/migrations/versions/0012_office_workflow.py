"""add vacation_requests, sick_leaves, hr_requests, announcements + kuerzel columns

Revision ID: 0012
Revises: 0011
Create Date: 2026-04-14
"""

from alembic import op
import sqlalchemy as sa

revision = "0012"
down_revision = "0011"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Users: Bearbeitungs-Kürzel
    op.add_column(
        "users",
        sa.Column("initials", sa.String(length=10), nullable=True),
    )

    # CallRequests: kuerzel + response
    op.add_column(
        "call_requests",
        sa.Column("handler_kuerzel", sa.String(length=10), nullable=True),
    )
    op.add_column(
        "call_requests", sa.Column("response_text", sa.Text(), nullable=True)
    )

    # PatientIntakeRequests: kuerzel + response
    op.add_column(
        "patient_intake_requests",
        sa.Column("handler_kuerzel", sa.String(length=10), nullable=True),
    )
    op.add_column(
        "patient_intake_requests",
        sa.Column("response_text", sa.Text(), nullable=True),
    )

    # Vacation Requests
    op.create_table(
        "vacation_requests",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("from_date", sa.Date(), nullable=False),
        sa.Column("to_date", sa.Date(), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=30), nullable=False),
        sa.Column("approved_from_date", sa.Date(), nullable=True),
        sa.Column("approved_to_date", sa.Date(), nullable=True),
        sa.Column("handler_user_id", sa.Integer(), nullable=True),
        sa.Column("handler_kuerzel", sa.String(length=10), nullable=True),
        sa.Column("handled_at", sa.DateTime(), nullable=True),
        sa.Column("response_text", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["handler_user_id"], ["users.id"], ondelete="SET NULL"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_vacation_requests_id"),
        "vacation_requests",
        ["id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_vacation_requests_user_id"),
        "vacation_requests",
        ["user_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_vacation_requests_status"),
        "vacation_requests",
        ["status"],
        unique=False,
    )
    op.create_index(
        op.f("ix_vacation_requests_created_at"),
        "vacation_requests",
        ["created_at"],
        unique=False,
    )

    # Sick Leaves
    op.create_table(
        "sick_leaves",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("from_date", sa.Date(), nullable=False),
        sa.Column("to_date", sa.Date(), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("handler_user_id", sa.Integer(), nullable=True),
        sa.Column("handler_kuerzel", sa.String(length=10), nullable=True),
        sa.Column("acknowledged_at", sa.DateTime(), nullable=True),
        sa.Column("response_text", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["handler_user_id"], ["users.id"], ondelete="SET NULL"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_sick_leaves_id"), "sick_leaves", ["id"], unique=False
    )
    op.create_index(
        op.f("ix_sick_leaves_user_id"),
        "sick_leaves",
        ["user_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_sick_leaves_created_at"),
        "sick_leaves",
        ["created_at"],
        unique=False,
    )

    # HR Requests
    op.create_table(
        "hr_requests",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("category", sa.String(length=40), nullable=False),
        sa.Column("subject", sa.String(length=255), nullable=False),
        sa.Column("body", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("handler_user_id", sa.Integer(), nullable=True),
        sa.Column("handler_kuerzel", sa.String(length=10), nullable=True),
        sa.Column("handled_at", sa.DateTime(), nullable=True),
        sa.Column("response_text", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["handler_user_id"], ["users.id"], ondelete="SET NULL"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_hr_requests_id"), "hr_requests", ["id"], unique=False
    )
    op.create_index(
        op.f("ix_hr_requests_user_id"),
        "hr_requests",
        ["user_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_hr_requests_category"),
        "hr_requests",
        ["category"],
        unique=False,
    )
    op.create_index(
        op.f("ix_hr_requests_status"),
        "hr_requests",
        ["status"],
        unique=False,
    )
    op.create_index(
        op.f("ix_hr_requests_created_at"),
        "hr_requests",
        ["created_at"],
        unique=False,
    )

    # Announcements
    op.create_table(
        "announcements",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("visible_from", sa.DateTime(), nullable=False),
        sa.Column("visible_until", sa.DateTime(), nullable=False),
        sa.Column("created_by_user_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(
            ["created_by_user_id"], ["users.id"], ondelete="SET NULL"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_announcements_id"), "announcements", ["id"], unique=False
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_announcements_id"), table_name="announcements")
    op.drop_table("announcements")

    op.drop_index(op.f("ix_hr_requests_created_at"), table_name="hr_requests")
    op.drop_index(op.f("ix_hr_requests_status"), table_name="hr_requests")
    op.drop_index(op.f("ix_hr_requests_category"), table_name="hr_requests")
    op.drop_index(op.f("ix_hr_requests_user_id"), table_name="hr_requests")
    op.drop_index(op.f("ix_hr_requests_id"), table_name="hr_requests")
    op.drop_table("hr_requests")

    op.drop_index(op.f("ix_sick_leaves_created_at"), table_name="sick_leaves")
    op.drop_index(op.f("ix_sick_leaves_user_id"), table_name="sick_leaves")
    op.drop_index(op.f("ix_sick_leaves_id"), table_name="sick_leaves")
    op.drop_table("sick_leaves")

    op.drop_index(
        op.f("ix_vacation_requests_created_at"), table_name="vacation_requests"
    )
    op.drop_index(
        op.f("ix_vacation_requests_status"), table_name="vacation_requests"
    )
    op.drop_index(
        op.f("ix_vacation_requests_user_id"), table_name="vacation_requests"
    )
    op.drop_index(
        op.f("ix_vacation_requests_id"), table_name="vacation_requests"
    )
    op.drop_table("vacation_requests")

    op.drop_column("patient_intake_requests", "response_text")
    op.drop_column("patient_intake_requests", "handler_kuerzel")
    op.drop_column("call_requests", "response_text")
    op.drop_column("call_requests", "handler_kuerzel")
    op.drop_column("users", "initials")

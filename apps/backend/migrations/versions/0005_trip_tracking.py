"""add user_home_locations and trip_segments tables

Revision ID: 0005
Revises: 0004
Create Date: 2026-04-14
"""

from alembic import op
import sqlalchemy as sa

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "user_home_locations",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("address_line", sa.String(length=500), nullable=False),
        sa.Column("latitude", sa.Float(), nullable=True),
        sa.Column("longitude", sa.Float(), nullable=True),
        sa.Column("source", sa.String(length=20), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id"),
    )
    op.create_index(
        op.f("ix_user_home_locations_id"),
        "user_home_locations",
        ["id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_user_home_locations_user_id"),
        "user_home_locations",
        ["user_id"],
        unique=False,
    )

    op.create_table(
        "trip_segments",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("entry_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("segment_index", sa.Integer(), nullable=False),
        sa.Column("kind", sa.String(length=20), nullable=False),
        sa.Column("from_address", sa.String(length=500), nullable=False),
        sa.Column("from_latitude", sa.Float(), nullable=True),
        sa.Column("from_longitude", sa.Float(), nullable=True),
        sa.Column("to_address", sa.String(length=500), nullable=False),
        sa.Column("to_latitude", sa.Float(), nullable=True),
        sa.Column("to_longitude", sa.Float(), nullable=True),
        sa.Column("distance_km", sa.Float(), nullable=True),
        sa.Column("trip_date", sa.Date(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(
            ["entry_id"], ["entries.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_trip_segments_id"), "trip_segments", ["id"], unique=False
    )
    op.create_index(
        op.f("ix_trip_segments_entry_id"),
        "trip_segments",
        ["entry_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_trip_segments_user_id"),
        "trip_segments",
        ["user_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_trip_segments_trip_date"),
        "trip_segments",
        ["trip_date"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_trip_segments_trip_date"), table_name="trip_segments")
    op.drop_index(op.f("ix_trip_segments_user_id"), table_name="trip_segments")
    op.drop_index(op.f("ix_trip_segments_entry_id"), table_name="trip_segments")
    op.drop_index(op.f("ix_trip_segments_id"), table_name="trip_segments")
    op.drop_table("trip_segments")
    op.drop_index(
        op.f("ix_user_home_locations_user_id"),
        table_name="user_home_locations",
    )
    op.drop_index(
        op.f("ix_user_home_locations_id"), table_name="user_home_locations"
    )
    op.drop_table("user_home_locations")

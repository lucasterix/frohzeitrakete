"""create pflegehm_settings table (singleton config)

Revision ID: 0025
Revises: 0024
Create Date: 2026-04-15
"""

from alembic import op
import sqlalchemy as sa

revision = "0025"
down_revision = "0024"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "pflegehm_settings",
        sa.Column("id", sa.Integer(), primary_key=True),
        # Leistungserbringer
        sa.Column("ik", sa.String(9), nullable=True),
        sa.Column("abrechnungscode", sa.String(10), nullable=True),
        sa.Column("tarifkennzeichen", sa.String(10), nullable=True),
        sa.Column(
            "verfahrenskennung",
            sa.String(10),
            nullable=False,
            server_default="TPFL0",
        ),
        # SMTP
        sa.Column("smtp_server", sa.String(255), nullable=True),
        sa.Column("smtp_port", sa.Integer(), nullable=True),
        sa.Column("smtp_user", sa.String(255), nullable=True),
        sa.Column("smtp_password", sa.String(255), nullable=True),
        sa.Column("smtp_use_tls", sa.Boolean(), nullable=False, server_default="1"),
        sa.Column("email_absender", sa.String(255), nullable=True),
        # USt
        sa.Column("ust_pflichtig", sa.Boolean(), nullable=False, server_default="0"),
        sa.Column("ust_satz", sa.Float(), nullable=True),
        # Firma
        sa.Column("firma_name", sa.String(255), nullable=True),
        sa.Column("firma_address", sa.String(500), nullable=True),
        sa.Column("firma_phone", sa.String(50), nullable=True),
        sa.Column("firma_email", sa.String(255), nullable=True),
        # Kontakt
        sa.Column("kontakt_person", sa.String(255), nullable=True),
        sa.Column("kontakt_telefon", sa.String(50), nullable=True),
        sa.Column("kontakt_fax", sa.String(50), nullable=True),
        # Bank
        sa.Column("bank_name", sa.String(255), nullable=True),
        sa.Column("bank_iban", sa.String(34), nullable=True),
        sa.Column("bank_bic", sa.String(11), nullable=True),
        # Timestamps
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

    # Insert singleton row
    tbl = sa.table("pflegehm_settings", sa.column("id", sa.Integer))
    op.bulk_insert(tbl, [{"id": 1}])


def downgrade() -> None:
    op.drop_table("pflegehm_settings")

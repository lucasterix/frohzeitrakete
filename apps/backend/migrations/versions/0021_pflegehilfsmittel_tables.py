"""create pflegehilfsmittel, kostentraeger, abrechnung, position tables + seed hilfsmittel

Revision ID: 0021
Revises: 0020
Create Date: 2026-04-15
"""

from alembic import op
import sqlalchemy as sa

revision = "0021"
down_revision = "0020"
branch_labels = None
depends_on = None

# 16 Standard-Hilfsmittel (aus pflegekreuzer fixtures.py)
SEED_HILFSMITTEL = [
    ("Saugende Bettschutzeinlage (Einmalgebrauch)", "54.45.01.0001", "00", 25, 10.25),
    ("Fingerlinge", "54.99.01.0001", "00", 100, 5.00),
    ("Einmalhandschuhe", "54.99.01.1001", "00", 100, 9.00),
    ("Medizinische Gesichtsmaske", "54.99.01.2001", "00", 50, 6.00),
    ("FFP2-Gesichtsmaske", "54.99.01.5001", "00", 20, 13.00),
    ("Schutzservietten (Einmalgebrauch)", "54.99.01.4001", "00", 100, 10.00),
    ("Schutzschürzen (Wiederverwendbar)", "54.99.01.3002", "00", 1, 20.50),
    ("Händedesinfektionsmittel", "54.99.02.0001", "00", 5, 6.95),
    ("Flächendesinfektionsmittel", "54.99.02.0002", "00", 5, 5.65),
    ("Händedesinfektionstücher", "54.99.02.0014", "00", 60, 12.00),
    ("Flächendesinfektionstücher", "54.99.02.0015", "00", 100, 16.00),
    ("Abschlagspositionsnummer (Differenzbetrag)", "54.00.99.0088", "00", 0, 0.00),
    ("Saugende Bettschutzeinlage (Wiederverwendbar)", "51.40.01.4", "00", 1, 22.98),
    ("Schutzschürzen (Einmalgebrauch)", "54.99.01.3001", "00", 10, 11.00),
    ("Schürzen (Einmalgebrauch)", "54.99.01.3001", "00", 10, 11.00),
    ("Schürzen (Wiederverwendbar)", "54.99.01.3002", "00", 1, 20.50),
]


def upgrade() -> None:
    # --- pflegehilfsmittel ---
    op.create_table(
        "pflegehilfsmittel",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("bezeichnung", sa.String(255), nullable=False, unique=True),
        sa.Column("positionsnummer", sa.String(50), nullable=False),
        sa.Column("kennzeichen", sa.String(10), nullable=False, server_default="00"),
        sa.Column("packungsgroesse", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("preis_brutto", sa.Float(), nullable=False, server_default="0"),
    )

    # --- kostentraeger ---
    op.create_table(
        "kostentraeger",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("address", sa.String(500), nullable=True),
        sa.Column("ik", sa.String(9), nullable=False, unique=True),
        sa.Column("annahmestelle", sa.String(255), nullable=True),
        sa.Column("annahmestelle_ik", sa.String(9), nullable=True),
        sa.Column("annahmestelle_email", sa.String(255), nullable=True),
    )

    # --- pflegehm_abrechnungen ---
    op.create_table(
        "pflegehm_abrechnungen",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("patient_id", sa.Integer(), nullable=False, index=True),
        sa.Column("patient_name", sa.String(255), nullable=False),
        sa.Column("versichertennummer", sa.String(30), nullable=False),
        sa.Column("geburtsdatum", sa.String(10), nullable=False),
        sa.Column("kasse_id", sa.Integer(), sa.ForeignKey("kostentraeger.id"), nullable=False),
        sa.Column("abrechnungsmonat", sa.String(7), nullable=False),
        sa.Column("gesamt_betrag", sa.Float(), nullable=False, server_default="0"),
        sa.Column("status", sa.String(20), nullable=False, server_default="entwurf"),
        sa.Column("gesendet_am", sa.DateTime(), nullable=True),
        sa.Column("storniert_am", sa.DateTime(), nullable=True),
        sa.Column(
            "signature_event_id",
            sa.Integer(),
            sa.ForeignKey("signature_events.id"),
            nullable=True,
        ),
        sa.Column(
            "created_by_user_id",
            sa.Integer(),
            sa.ForeignKey("users.id"),
            nullable=True,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )

    # --- pflegehm_positionen ---
    op.create_table(
        "pflegehm_positionen",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "abrechnung_id",
            sa.Integer(),
            sa.ForeignKey("pflegehm_abrechnungen.id"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "hilfsmittel_id",
            sa.Integer(),
            sa.ForeignKey("pflegehilfsmittel.id"),
            nullable=False,
        ),
        sa.Column("menge", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("einzelpreis", sa.Float(), nullable=False, server_default="0"),
        sa.Column("betrag_gesamt", sa.Float(), nullable=False, server_default="0"),
    )

    # --- Seed: 16 Standard-Hilfsmittel ---
    tbl = sa.table(
        "pflegehilfsmittel",
        sa.column("bezeichnung", sa.String),
        sa.column("positionsnummer", sa.String),
        sa.column("kennzeichen", sa.String),
        sa.column("packungsgroesse", sa.Integer),
        sa.column("preis_brutto", sa.Float),
    )
    op.bulk_insert(
        tbl,
        [
            {
                "bezeichnung": bez,
                "positionsnummer": pos,
                "kennzeichen": kz,
                "packungsgroesse": pkg,
                "preis_brutto": preis,
            }
            for bez, pos, kz, pkg, preis in SEED_HILFSMITTEL
        ],
    )


def downgrade() -> None:
    op.drop_table("pflegehm_positionen")
    op.drop_table("pflegehm_abrechnungen")
    op.drop_table("kostentraeger")
    op.drop_table("pflegehilfsmittel")

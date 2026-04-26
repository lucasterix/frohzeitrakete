"""create avis_documents and avis_entries tables for Mahnwesen

Revision ID: 0036
Revises: 0035
Create Date: 2026-04-26
"""

from alembic import op
import sqlalchemy as sa

revision = "0036"
down_revision = "0035"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "avis_documents",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("filename", sa.String(500), nullable=False),
        sa.Column("letter_date", sa.String(10), nullable=True),
        sa.Column("beleg_no", sa.String(100), nullable=True),
        sa.Column("doc_type", sa.String(20), nullable=False, server_default="OTHER"),
        sa.Column("entry_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("total_amount", sa.Float(), nullable=False, server_default="0"),
        sa.Column("warnings", sa.Text(), nullable=True),
        sa.Column("status", sa.String(30), nullable=False, server_default="parsed"),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("pdf_path", sa.String(500), nullable=True),
        sa.Column("source", sa.String(50), nullable=False, server_default="upload"),
        sa.Column("uploaded_by_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_avis_documents_status", "avis_documents", ["status"])

    op.create_table(
        "avis_entries",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("document_id", sa.Integer(), sa.ForeignKey("avis_documents.id", ondelete="CASCADE"), nullable=False),
        sa.Column("invoice_no", sa.String(50), nullable=False),
        sa.Column("amount_eur", sa.Float(), nullable=False),
        sa.Column("matched", sa.String(30), nullable=False, server_default="unmatched"),
        sa.Column("match_note", sa.String(255), nullable=True),
    )
    op.create_index("ix_avis_entries_document_id", "avis_entries", ["document_id"])
    op.create_index("ix_avis_entries_invoice_no", "avis_entries", ["invoice_no"])


def downgrade() -> None:
    op.drop_table("avis_entries")
    op.drop_table("avis_documents")

"""report share links

Revision ID: 0004
Revises: 45c30de3c30b
Create Date: 2026-09-08

"""
from alembic import op
import sqlalchemy as sa

revision = "0004"
down_revision = "45c30de3c30b"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "report_share_links",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("project_id", sa.Integer(), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("created_by", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("revoked_at", sa.DateTime(), nullable=True),
        sa.Column("last_viewed_at", sa.DateTime(), nullable=True),
        sa.Column("view_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_report_share_links_project_id", "report_share_links", ["project_id"])
    op.create_index("ix_report_share_links_token_hash", "report_share_links", ["token_hash"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_report_share_links_token_hash", table_name="report_share_links")
    op.drop_index("ix_report_share_links_project_id", table_name="report_share_links")
    op.drop_table("report_share_links")

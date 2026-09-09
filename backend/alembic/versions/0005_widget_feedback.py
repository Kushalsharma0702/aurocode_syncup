"""widget feedback

Revision ID: 0005
Revises: 0004
Create Date: 2026-09-09

"""
from alembic import op
import sqlalchemy as sa

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("projects", sa.Column("widget_key", sa.String(length=32), nullable=True))
    op.create_index("ix_projects_widget_key", "projects", ["widget_key"], unique=True)

    op.add_column("tasks", sa.Column("source", sa.String(length=10), nullable=False, server_default="manual"))
    op.add_column("tasks", sa.Column("page_url", sa.String(length=500), nullable=False, server_default=""))
    op.add_column("tasks", sa.Column("pin_x", sa.Float(), nullable=True))
    op.add_column("tasks", sa.Column("pin_y", sa.Float(), nullable=True))
    op.add_column("tasks", sa.Column("screenshot_filename", sa.String(length=255), nullable=False, server_default=""))
    op.add_column("tasks", sa.Column("reporter_name", sa.String(length=100), nullable=False, server_default=""))
    op.add_column("tasks", sa.Column("browser_info", sa.String(length=255), nullable=False, server_default=""))


def downgrade() -> None:
    op.drop_column("tasks", "browser_info")
    op.drop_column("tasks", "reporter_name")
    op.drop_column("tasks", "screenshot_filename")
    op.drop_column("tasks", "pin_y")
    op.drop_column("tasks", "pin_x")
    op.drop_column("tasks", "page_url")
    op.drop_column("tasks", "source")

    op.drop_index("ix_projects_widget_key", table_name="projects")
    op.drop_column("projects", "widget_key")

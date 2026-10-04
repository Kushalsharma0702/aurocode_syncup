"""Production hardening plus the closed feedback loop.

Adds:
  - users.email / users.phone      so clients can be reached outside the app
  - projects.widget_origins        origin allow-list bound to each widget key
  - tasks.verified_at / reopened_count / ack_due_date
  - client_access_links            magic-link sign-in for clients
  - widget_events                  funnel telemetry from the embedded widget

Revision ID: 0006
Revises: 0005
"""
import sqlalchemy as sa
from alembic import op

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("users") as batch:
        batch.add_column(sa.Column("email", sa.String(255), nullable=False, server_default=""))
        batch.add_column(sa.Column("phone", sa.String(20), nullable=False, server_default=""))
    op.create_index("ix_users_email", "users", ["email"])

    with op.batch_alter_table("projects") as batch:
        batch.add_column(sa.Column("widget_origins", sa.String(500), nullable=False, server_default=""))

    with op.batch_alter_table("tasks") as batch:
        batch.add_column(sa.Column("verified_at", sa.DateTime(), nullable=True))
        batch.add_column(sa.Column("reopened_count", sa.Integer(), nullable=False, server_default="0"))
        batch.add_column(sa.Column("ack_due_date", sa.Date(), nullable=True))

    op.create_table(
        "client_access_links",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("token_hash", sa.String(64), nullable=False),
        sa.Column("created_by", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("revoked_at", sa.DateTime(), nullable=True),
        sa.Column("last_used_at", sa.DateTime(), nullable=True),
        sa.Column("use_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_client_access_links_user_id", "client_access_links", ["user_id"])
    op.create_index(
        "ix_client_access_links_token_hash", "client_access_links", ["token_hash"], unique=True
    )

    op.create_table(
        "widget_events",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("project_id", sa.Integer(), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("event", sa.String(30), nullable=False),
        sa.Column("page_url", sa.String(500), nullable=False, server_default=""),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_widget_events_project_id", "widget_events", ["project_id"])
    op.create_index("ix_widget_events_event", "widget_events", ["event"])
    op.create_index("ix_widget_events_created_at", "widget_events", ["created_at"])


def downgrade() -> None:
    op.drop_table("widget_events")
    op.drop_table("client_access_links")
    with op.batch_alter_table("tasks") as batch:
        batch.drop_column("ack_due_date")
        batch.drop_column("reopened_count")
        batch.drop_column("verified_at")
    with op.batch_alter_table("projects") as batch:
        batch.drop_column("widget_origins")
    op.drop_index("ix_users_email", table_name="users")
    with op.batch_alter_table("users") as batch:
        batch.drop_column("phone")
        batch.drop_column("email")

"""add folder tables

Revision ID: e7a1b2c3d4f5
Revises: d5e8a3f9c021
Create Date: 2026-07-10
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "e7a1b2c3d4f5"
down_revision: Union[str, None] = "d5e8a3f9c021"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "folders",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("user_id", sa.String(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("(CURRENT_TIMESTAMP)"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_folders_user_id"), "folders", ["user_id"], unique=False)

    op.create_table(
        "folder_items",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("folder_id", sa.String(), nullable=False),
        sa.Column("track_id", sa.String(), nullable=False),
        sa.Column("item_type", sa.String(), nullable=False),
        sa.Column("added_at", sa.DateTime(timezone=True), server_default=sa.text("(CURRENT_TIMESTAMP)"), nullable=False),
        sa.ForeignKeyConstraint(["folder_id"], ["folders.id"]),
        sa.ForeignKeyConstraint(["track_id"], ["tracks.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("folder_id", "track_id", "item_type", name="uq_folder_track_type"),
    )
    op.create_index(op.f("ix_folder_items_folder_id"), "folder_items", ["folder_id"], unique=False)
    op.create_index(op.f("ix_folder_items_track_id"), "folder_items", ["track_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_folder_items_track_id"), table_name="folder_items")
    op.drop_index(op.f("ix_folder_items_folder_id"), table_name="folder_items")
    op.drop_table("folder_items")
    op.drop_index(op.f("ix_folders_user_id"), table_name="folders")
    op.drop_table("folders")

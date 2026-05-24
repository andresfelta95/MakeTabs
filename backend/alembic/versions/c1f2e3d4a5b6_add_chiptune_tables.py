"""add chiptune tables

Revision ID: c1f2e3d4a5b6
Revises: 3ad1e15b4557
Create Date: 2026-05-22 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'c1f2e3d4a5b6'
down_revision: Union[str, None] = 'b4c7d9e2f1a0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'chiptune_generations',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('track_id', sa.String(), nullable=False),
        sa.Column('status', sa.String(), nullable=False),
        sa.Column('current_step', sa.String(), nullable=True),
        sa.Column('chiptune_data', sa.JSON(), nullable=True),
        sa.Column('algorithm_version', sa.String(), nullable=False),
        sa.Column('error_message', sa.String(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
        sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['track_id'], ['tracks.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_chiptune_generations_track_id', 'chiptune_generations', ['track_id'])

    op.create_table(
        'user_chiptune_requests',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('user_id', sa.String(), nullable=False),
        sa.Column('track_id', sa.String(), nullable=False),
        sa.Column('chiptune_generation_id', sa.String(), nullable=False),
        sa.Column('requested_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
        sa.ForeignKeyConstraint(['chiptune_generation_id'], ['chiptune_generations.id']),
        sa.ForeignKeyConstraint(['track_id'], ['tracks.id']),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_user_chiptune_requests_user_id', 'user_chiptune_requests', ['user_id'])


def downgrade() -> None:
    op.drop_index('ix_user_chiptune_requests_user_id', 'user_chiptune_requests')
    op.drop_table('user_chiptune_requests')
    op.drop_index('ix_chiptune_generations_track_id', 'chiptune_generations')
    op.drop_table('chiptune_generations')

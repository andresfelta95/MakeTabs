"""add source to tab_generations

Revision ID: d5e8a3f9c021
Revises: c1f2e3d4a5b6
Create Date: 2026-05-24 13:45:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'd5e8a3f9c021'
down_revision: Union[str, None] = 'c1f2e3d4a5b6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'tab_generations',
        sa.Column('source', sa.String(), nullable=False, server_default='ml'),
    )


def downgrade() -> None:
    op.drop_column('tab_generations', 'source')

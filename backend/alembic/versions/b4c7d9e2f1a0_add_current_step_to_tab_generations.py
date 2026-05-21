"""add current_step to tab_generations

Revision ID: b4c7d9e2f1a0
Revises: 3ad1e15b4557
Create Date: 2026-05-20

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'b4c7d9e2f1a0'
down_revision: Union[str, None] = '3ad1e15b4557'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('tab_generations', sa.Column('current_step', sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column('tab_generations', 'current_step')

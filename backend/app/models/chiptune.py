import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, JSON, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class ChiptuneGeneration(Base):
    __tablename__ = "chiptune_generations"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    track_id: Mapped[str] = mapped_column(String, ForeignKey("tracks.id"), nullable=False, index=True)

    status: Mapped[str] = mapped_column(String, nullable=False, default="pending")
    current_step: Mapped[str | None] = mapped_column(String, nullable=True)

    chiptune_data: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    algorithm_version: Mapped[str] = mapped_column(String, nullable=False, default="1.0.0")
    error_message: Mapped[str | None] = mapped_column(String, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    track = relationship("Track", lazy="joined")
    requests = relationship("UserChiptuneRequest", back_populates="chiptune_generation")


class UserChiptuneRequest(Base):
    __tablename__ = "user_chiptune_requests"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String, ForeignKey("users.id"), nullable=False, index=True)
    track_id: Mapped[str] = mapped_column(String, ForeignKey("tracks.id"), nullable=False)
    chiptune_generation_id: Mapped[str] = mapped_column(
        String, ForeignKey("chiptune_generations.id"), nullable=False
    )
    requested_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    chiptune_generation = relationship("ChiptuneGeneration", back_populates="requests")

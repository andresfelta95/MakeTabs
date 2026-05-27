import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, JSON, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class TabGeneration(Base):
    """
    One tab generation job per track. Shared/cached — if two users request
    the same song, this row is reused and not reprocessed.
    """

    __tablename__ = "tab_generations"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    track_id: Mapped[str] = mapped_column(String, ForeignKey("tracks.id"), nullable=False, index=True)

    # pending | processing | done | failed
    status: Mapped[str] = mapped_column(String, nullable=False, default="pending")

    # downloading | separating | detecting | transcribing | building
    # searching_songsterr | fetching_songsterr_meta | fetching_songsterr_tabs | synthesizing_audio
    current_step: Mapped[str | None] = mapped_column(String, nullable=True)

    # Where the tab came from: "songsterr" (official) or "ml" (basic-pitch transcription)
    source: Mapped[str] = mapped_column(String, nullable=False, default="ml")

    # Structured tab output — see docs/architecture.md for JSON format
    tab_data: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    # Version string lets us invalidate cache when the algorithm improves
    algorithm_version: Mapped[str] = mapped_column(String, nullable=False, default="2.4.0")

    error_message: Mapped[str | None] = mapped_column(String, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    track = relationship("Track", lazy="joined")
    requests = relationship("UserTabRequest", back_populates="tab_generation")


class UserTabRequest(Base):
    """Records which user requested which track — for history and analytics."""

    __tablename__ = "user_tab_requests"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String, ForeignKey("users.id"), nullable=False, index=True)
    track_id: Mapped[str] = mapped_column(String, ForeignKey("tracks.id"), nullable=False)
    tab_generation_id: Mapped[str] = mapped_column(
        String, ForeignKey("tab_generations.id"), nullable=False
    )
    requested_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    tab_generation = relationship("TabGeneration", back_populates="requests")

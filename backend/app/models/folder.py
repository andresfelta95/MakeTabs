import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Folder(Base):
    """A user-created folder for saving songs (tabs and/or 16-bit versions)."""

    __tablename__ = "folders"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String, ForeignKey("users.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    items = relationship("FolderItem", back_populates="folder", cascade="all, delete-orphan")


class FolderItem(Base):
    """A saved song inside a folder. item_type says which format was saved."""

    __tablename__ = "folder_items"
    __table_args__ = (
        UniqueConstraint("folder_id", "track_id", "item_type", name="uq_folder_track_type"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    folder_id: Mapped[str] = mapped_column(String, ForeignKey("folders.id"), nullable=False, index=True)
    track_id: Mapped[str] = mapped_column(String, ForeignKey("tracks.id"), nullable=False, index=True)

    # "tab" | "chiptune"
    item_type: Mapped[str] = mapped_column(String, nullable=False)

    added_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    folder = relationship("Folder", back_populates="items")
    track = relationship("Track", lazy="joined")

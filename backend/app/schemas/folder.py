from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.track import TrackOut

ItemType = Literal["tab", "chiptune"]


class FolderCreate(BaseModel):
    name: str = Field(min_length=1, max_length=60)


class FolderUpdate(BaseModel):
    name: str = Field(min_length=1, max_length=60)


class FolderOut(BaseModel):
    id: str
    name: str
    created_at: datetime
    tab_count: int = 0
    chiptune_count: int = 0


class FolderItemOut(BaseModel):
    id: str
    item_type: ItemType
    added_at: datetime
    track: TrackOut
    # Latest generation job for this track in this format, if any
    job_id: str | None = None
    job_status: str | None = None


class FolderDetailOut(BaseModel):
    id: str
    name: str
    created_at: datetime
    items: list[FolderItemOut]


class AddFolderItemRequest(BaseModel):
    spotify_track_id: str
    item_type: ItemType

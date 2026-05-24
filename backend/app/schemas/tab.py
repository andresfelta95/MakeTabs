from datetime import datetime
from pydantic import BaseModel

from app.schemas.track import TrackOut


class GenerateTabRequest(BaseModel):
    spotify_track_id: str
    force: bool = False


class TabJobOut(BaseModel):
    job_id: str
    status: str  # pending | processing | done | failed
    current_step: str | None  # downloading | separating | detecting | transcribing | building
    has_guitar: bool | None
    tab_data: dict | None
    error: str | None
    track: TrackOut | None
    created_at: datetime
    completed_at: datetime | None

    model_config = {"from_attributes": True}

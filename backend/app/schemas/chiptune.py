from datetime import datetime
from pydantic import BaseModel

from app.schemas.track import TrackOut


class GenerateChiptuneRequest(BaseModel):
    spotify_track_id: str
    force: bool = False


class ChiptuneJobOut(BaseModel):
    job_id: str
    status: str
    current_step: str | None
    chiptune_data: dict | None
    error: str | None
    track: TrackOut | None
    created_at: datetime
    completed_at: datetime | None

    model_config = {"from_attributes": True}

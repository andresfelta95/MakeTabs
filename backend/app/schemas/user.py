from datetime import datetime
from pydantic import BaseModel


class UserOut(BaseModel):
    id: str
    spotify_id: str
    display_name: str | None
    email: str | None
    created_at: datetime

    model_config = {"from_attributes": True}

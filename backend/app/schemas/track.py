from pydantic import BaseModel


class TrackOut(BaseModel):
    spotify_id: str
    title: str
    artist: str
    album: str | None
    duration_ms: int | None
    preview_url: str | None
    image_url: str | None
    has_guitar: bool | None

    model_config = {"from_attributes": True}


class PlaylistOut(BaseModel):
    id: str
    name: str
    track_count: int
    image_url: str | None


class PaginatedTracks(BaseModel):
    items: list[TrackOut]
    total: int
    limit: int
    offset: int


class PaginatedPlaylists(BaseModel):
    items: list[PlaylistOut]
    total: int
    limit: int
    offset: int

"""
Spotify proxy routes — all Spotify API calls go through here.
Tokens are never exposed to the frontend.
"""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User
from app.routes.auth import get_current_user
from app.schemas.track import PaginatedPlaylists, PaginatedTracks, TrackOut
from app.services.spotify_client import SpotifyClient

router = APIRouter(prefix="/spotify", tags=["spotify"])


def _spotify(user: User, db: AsyncSession) -> SpotifyClient:
    return SpotifyClient(user, db)


@router.get("/playlists", response_model=PaginatedPlaylists)
async def get_playlists(
    limit: int = Query(20, ge=1, le=50),
    offset: int = Query(0, ge=0),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await _spotify(user, db).get_playlists(limit=limit, offset=offset)


@router.get("/playlists/{playlist_id}/tracks", response_model=PaginatedTracks)
async def get_playlist_tracks(
    playlist_id: str,
    limit: int = Query(20, ge=1, le=50),
    offset: int = Query(0, ge=0),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await _spotify(user, db).get_playlist_tracks(
        playlist_id, limit=limit, offset=offset
    )


@router.get("/search", response_model=PaginatedTracks)
async def search_tracks(
    q: str = Query(..., min_length=1),
    limit: int = Query(20, ge=1, le=50),
    offset: int = Query(0, ge=0),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await _spotify(user, db).search_tracks(query=q, limit=limit, offset=offset)


@router.get("/tracks/{spotify_track_id}", response_model=TrackOut)
async def get_track(
    spotify_track_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await _spotify(user, db).get_track(spotify_track_id)

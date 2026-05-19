"""
Tab generation routes.

POST /tabs/generate          — request tab generation for a Spotify track
GET  /tabs/{job_id}          — poll job status
GET  /tabs/track/{spotify_id} — get cached tab by Spotify track ID
"""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.tab import TabGeneration, UserTabRequest
from app.models.track import Track
from app.models.user import User
from app.routes.auth import get_current_user
from app.schemas.tab import GenerateTabRequest, TabJobOut
from app.schemas.track import TrackOut
from app.services.spotify_client import SpotifyClient

router = APIRouter(prefix="/tabs", tags=["tabs"])


@router.post("/generate", response_model=TabJobOut)
async def generate_tabs(
    body: GenerateTabRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    spotify_id = body.spotify_track_id

    # Ensure track is cached locally
    result = await db.execute(select(Track).where(Track.spotify_id == spotify_id))
    track = result.scalar_one_or_none()

    if track is None:
        # Fetch from Spotify and cache
        spotify = SpotifyClient(user, db)
        track_data = await spotify.get_track(spotify_id)
        track = Track(**{k: v for k, v in track_data.items() if k != "has_guitar"})
        db.add(track)
        await db.flush()

    # Check if a tab generation already exists for this track
    result = await db.execute(
        select(TabGeneration)
        .where(TabGeneration.track_id == track.id)
        .order_by(TabGeneration.created_at.desc())
    )
    tab_gen = result.scalar_one_or_none()

    if tab_gen is None or tab_gen.status == "failed":
        tab_gen = TabGeneration(track_id=track.id, status="pending")
        db.add(tab_gen)
        await db.flush()

    # Record this user's request
    request_record = UserTabRequest(
        user_id=user.id,
        track_id=track.id,
        tab_generation_id=tab_gen.id,
    )
    db.add(request_record)
    await db.commit()
    await db.refresh(tab_gen)

    # TODO (Phase 2): enqueue background processing job
    # from app.tasks import process_tab_job
    # process_tab_job.delay(tab_gen.id)

    return _tab_job_out(tab_gen, track)


@router.get("/track/{spotify_track_id}", response_model=TabJobOut)
async def get_tab_by_spotify_id(
    spotify_track_id: str,
    _: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Track).where(Track.spotify_id == spotify_track_id))
    track = result.scalar_one_or_none()
    if not track:
        raise HTTPException(status_code=404, detail="Track not found")

    result = await db.execute(
        select(TabGeneration)
        .where(TabGeneration.track_id == track.id)
        .order_by(TabGeneration.created_at.desc())
    )
    tab_gen = result.scalar_one_or_none()
    if not tab_gen:
        raise HTTPException(status_code=404, detail="No tab generated for this track yet")

    return _tab_job_out(tab_gen, track)


@router.get("/{job_id}", response_model=TabJobOut)
async def get_tab_job(
    job_id: str,
    _: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(TabGeneration).where(TabGeneration.id == job_id))
    tab_gen = result.scalar_one_or_none()
    if not tab_gen:
        raise HTTPException(status_code=404, detail="Job not found")

    result = await db.execute(select(Track).where(Track.id == tab_gen.track_id))
    track = result.scalar_one_or_none()

    return _tab_job_out(tab_gen, track)


def _tab_job_out(tab_gen: TabGeneration, track: Track) -> dict:
    track_out = TrackOut(
        spotify_id=track.spotify_id,
        title=track.title,
        artist=track.artist,
        album=track.album,
        duration_ms=track.duration_ms,
        preview_url=track.preview_url,
        image_url=track.image_url,
        has_guitar=track.has_guitar,
    )
    return TabJobOut(
        job_id=tab_gen.id,
        status=tab_gen.status,
        has_guitar=track.has_guitar,
        tab_data=tab_gen.tab_data,
        error=tab_gen.error_message,
        track=track_out,
        created_at=tab_gen.created_at,
        completed_at=tab_gen.completed_at,
    )

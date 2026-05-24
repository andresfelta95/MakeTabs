"""
Chiptune generation routes.

POST /chiptune/generate   — request chiptune for a Spotify track
GET  /chiptune/history    — user's chiptune history
GET  /chiptune/{job_id}   — poll job status
"""

from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.chiptune import ChiptuneGeneration, UserChiptuneRequest
from app.models.track import Track
from app.models.user import User
from app.routes.auth import get_current_user
from app.schemas.chiptune import ChiptuneJobOut, GenerateChiptuneRequest
from app.services.chiptune_pipeline import CURRENT_ALGORITHM, process_chiptune_job
from app.services.spotify_client import SpotifyClient

router = APIRouter(prefix="/chiptune", tags=["chiptune"])


def _job_out(job: ChiptuneGeneration) -> dict:
    track = job.track
    return {
        "job_id": job.id,
        "status": job.status,
        "current_step": job.current_step,
        "chiptune_data": job.chiptune_data,
        "error": job.error_message,
        "track": {
            "spotify_id": track.spotify_id,
            "title": track.title,
            "artist": track.artist,
            "album": track.album,
            "duration_ms": track.duration_ms,
            "preview_url": track.preview_url,
            "image_url": track.image_url,
            "has_guitar": track.has_guitar,
        } if track else None,
        "created_at": job.created_at,
        "completed_at": job.completed_at,
    }


@router.post("/generate", response_model=ChiptuneJobOut)
async def generate_chiptune(
    body: GenerateChiptuneRequest,
    background_tasks: BackgroundTasks,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    spotify_id = body.spotify_track_id

    result = await db.execute(select(Track).where(Track.spotify_id == spotify_id))
    track = result.scalar_one_or_none()

    if track is None:
        spotify = SpotifyClient(user, db)
        track_data = await spotify.get_track(spotify_id)
        track = Track(**{k: v for k, v in track_data.items() if k != "has_guitar"})
        db.add(track)
        await db.flush()

    # Look for existing job
    result = await db.execute(
        select(ChiptuneGeneration)
        .where(ChiptuneGeneration.track_id == track.id)
        .order_by(ChiptuneGeneration.created_at.desc())
        .limit(1)
    )
    job = result.scalar_one_or_none()

    needs_reprocess = (
        job is None
        or job.status == "failed"
        or body.force
        or (job.status == "done" and job.algorithm_version != CURRENT_ALGORITHM)
    )

    if needs_reprocess:
        job = ChiptuneGeneration(
            track_id=track.id,
            status="pending",
            algorithm_version=CURRENT_ALGORITHM,
        )
        db.add(job)
        await db.flush()

    result = await db.execute(
        select(UserChiptuneRequest)
        .where(
            UserChiptuneRequest.user_id == user.id,
            UserChiptuneRequest.chiptune_generation_id == job.id,
        )
        .limit(1)
    )
    if not result.scalar_one_or_none():
        db.add(UserChiptuneRequest(
            user_id=user.id,
            track_id=track.id,
            chiptune_generation_id=job.id,
        ))

    await db.commit()
    await db.refresh(job)

    if needs_reprocess or job.status == "pending":
        background_tasks.add_task(
            process_chiptune_job,
            job.id,
            track.title,
            track.artist,
            track.duration_ms or 240000,
        )

    return _job_out(job)


@router.get("/history", response_model=list[ChiptuneJobOut])
async def get_chiptune_history(
    limit: int = Query(30, ge=1, le=50),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ChiptuneGeneration, Track)
        .join(UserChiptuneRequest, UserChiptuneRequest.chiptune_generation_id == ChiptuneGeneration.id)
        .join(Track, Track.id == ChiptuneGeneration.track_id)
        .where(UserChiptuneRequest.user_id == user.id)
        .order_by(UserChiptuneRequest.requested_at.desc())
    )
    seen: set[str] = set()
    jobs: list[dict] = []
    for job, track in result:
        if track.id not in seen:
            seen.add(track.id)
            jobs.append(_job_out(job))
        if len(jobs) >= limit:
            break
    return jobs


@router.get("/{job_id}", response_model=ChiptuneJobOut)
async def get_chiptune_job(
    job_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ChiptuneGeneration).where(ChiptuneGeneration.id == job_id)
    )
    job = result.scalar_one_or_none()
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    return _job_out(job)

"""
Personal folder routes — users save songs (tabs / 16-bit) into named folders.

GET    /folders                      — list my folders with item counts
POST   /folders                      — create a folder
PATCH  /folders/{folder_id}          — rename a folder
DELETE /folders/{folder_id}          — delete a folder (and its items)
GET    /folders/{folder_id}          — folder contents (optionally filtered by item_type)
POST   /folders/{folder_id}/items    — save a song into the folder
DELETE /folders/{folder_id}/items    — remove a song from the folder (by spotify id + type)
GET    /folders/memberships          — map of saved songs → folder ids (one format)
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.chiptune import ChiptuneGeneration
from app.models.folder import Folder, FolderItem
from app.models.tab import TabGeneration
from app.models.track import Track
from app.models.user import User
from app.routes.auth import get_current_user
from app.schemas.folder import (
    AddFolderItemRequest,
    FolderCreate,
    FolderDetailOut,
    FolderItemOut,
    FolderOut,
    FolderUpdate,
)
from app.schemas.track import TrackOut

router = APIRouter(prefix="/folders", tags=["folders"])

MAX_FOLDERS_PER_USER = 50


async def _get_owned_folder(folder_id: str, user: User, db: AsyncSession) -> Folder:
    result = await db.execute(select(Folder).where(Folder.id == folder_id))
    folder = result.scalar_one_or_none()
    if not folder or folder.user_id != user.id:
        raise HTTPException(status_code=404, detail="Folder not found")
    return folder


@router.get("", response_model=list[FolderOut])
async def list_folders(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(
            Folder,
            func.count(FolderItem.id).filter(FolderItem.item_type == "tab").label("tab_count"),
            func.count(FolderItem.id).filter(FolderItem.item_type == "chiptune").label("chiptune_count"),
        )
        .outerjoin(FolderItem, FolderItem.folder_id == Folder.id)
        .where(Folder.user_id == user.id)
        .group_by(Folder.id)
        .order_by(Folder.created_at.asc())
    )
    return [
        FolderOut(
            id=folder.id,
            name=folder.name,
            created_at=folder.created_at,
            tab_count=tab_count,
            chiptune_count=chiptune_count,
        )
        for folder, tab_count, chiptune_count in result
    ]


@router.post("", response_model=FolderOut)
async def create_folder(
    body: FolderCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    name = body.name.strip()
    if not name:
        raise HTTPException(status_code=422, detail="Folder name cannot be empty")

    result = await db.execute(select(func.count(Folder.id)).where(Folder.user_id == user.id))
    if result.scalar_one() >= MAX_FOLDERS_PER_USER:
        raise HTTPException(status_code=400, detail="Folder limit reached")

    result = await db.execute(
        select(Folder).where(Folder.user_id == user.id, func.lower(Folder.name) == name.lower())
    )
    if result.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="A folder with that name already exists")

    folder = Folder(user_id=user.id, name=name)
    db.add(folder)
    await db.commit()
    await db.refresh(folder)
    return FolderOut(id=folder.id, name=folder.name, created_at=folder.created_at)


@router.get("/memberships", response_model=dict[str, list[str]])
async def get_memberships(
    item_type: str = Query(..., pattern="^(tab|chiptune)$"),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Map of spotify_track_id → folder ids, for every song I saved in this format."""
    result = await db.execute(
        select(Track.spotify_id, FolderItem.folder_id)
        .join(Folder, Folder.id == FolderItem.folder_id)
        .join(Track, Track.id == FolderItem.track_id)
        .where(Folder.user_id == user.id, FolderItem.item_type == item_type)
    )
    memberships: dict[str, list[str]] = {}
    for spotify_id, folder_id in result:
        memberships.setdefault(spotify_id, []).append(folder_id)
    return memberships


@router.patch("/{folder_id}", response_model=FolderOut)
async def rename_folder(
    folder_id: str,
    body: FolderUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    folder = await _get_owned_folder(folder_id, user, db)
    name = body.name.strip()
    if not name:
        raise HTTPException(status_code=422, detail="Folder name cannot be empty")
    folder.name = name
    await db.commit()
    await db.refresh(folder)
    return FolderOut(id=folder.id, name=folder.name, created_at=folder.created_at)


@router.delete("/{folder_id}", status_code=204)
async def delete_folder(
    folder_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    folder = await _get_owned_folder(folder_id, user, db)
    await db.delete(folder)
    await db.commit()


@router.get("/{folder_id}", response_model=FolderDetailOut)
async def get_folder(
    folder_id: str,
    item_type: str | None = Query(None, pattern="^(tab|chiptune)$"),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    folder = await _get_owned_folder(folder_id, user, db)

    query = (
        select(FolderItem)
        .where(FolderItem.folder_id == folder.id)
        .order_by(FolderItem.added_at.desc())
    )
    if item_type:
        query = query.where(FolderItem.item_type == item_type)
    result = await db.execute(query)
    items = result.scalars().all()

    # Resolve each item's latest generation job so the UI can link straight to it
    track_ids = [item.track_id for item in items]
    latest_tab: dict[str, TabGeneration] = {}
    latest_chip: dict[str, ChiptuneGeneration] = {}
    if track_ids:
        result = await db.execute(
            select(TabGeneration)
            .where(TabGeneration.track_id.in_(track_ids))
            .order_by(TabGeneration.created_at.desc())
        )
        for gen in result.scalars():
            latest_tab.setdefault(gen.track_id, gen)
        result = await db.execute(
            select(ChiptuneGeneration)
            .where(ChiptuneGeneration.track_id.in_(track_ids))
            .order_by(ChiptuneGeneration.created_at.desc())
        )
        for gen in result.scalars():
            latest_chip.setdefault(gen.track_id, gen)

    items_out = []
    for item in items:
        gen = latest_tab.get(item.track_id) if item.item_type == "tab" else latest_chip.get(item.track_id)
        items_out.append(
            FolderItemOut(
                id=item.id,
                item_type=item.item_type,
                added_at=item.added_at,
                track=TrackOut.model_validate(item.track),
                job_id=gen.id if gen else None,
                job_status=gen.status if gen else None,
            )
        )

    return FolderDetailOut(id=folder.id, name=folder.name, created_at=folder.created_at, items=items_out)


@router.post("/{folder_id}/items", response_model=FolderItemOut)
async def add_item(
    folder_id: str,
    body: AddFolderItemRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    folder = await _get_owned_folder(folder_id, user, db)

    result = await db.execute(select(Track).where(Track.spotify_id == body.spotify_track_id))
    track = result.scalar_one_or_none()
    if not track:
        raise HTTPException(status_code=404, detail="Track not found — generate it first")

    result = await db.execute(
        select(FolderItem).where(
            FolderItem.folder_id == folder.id,
            FolderItem.track_id == track.id,
            FolderItem.item_type == body.item_type,
        )
    )
    item = result.scalar_one_or_none()
    if not item:
        item = FolderItem(folder_id=folder.id, track_id=track.id, item_type=body.item_type)
        db.add(item)
        await db.commit()
        await db.refresh(item)

    return FolderItemOut(
        id=item.id,
        item_type=item.item_type,
        added_at=item.added_at,
        track=TrackOut.model_validate(track),
    )


@router.delete("/{folder_id}/items", status_code=204)
async def remove_item(
    folder_id: str,
    spotify_track_id: str = Query(...),
    item_type: str = Query(..., pattern="^(tab|chiptune)$"),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    folder = await _get_owned_folder(folder_id, user, db)

    result = await db.execute(
        select(FolderItem)
        .join(Track, Track.id == FolderItem.track_id)
        .where(
            FolderItem.folder_id == folder.id,
            Track.spotify_id == spotify_track_id,
            FolderItem.item_type == item_type,
        )
    )
    item = result.scalar_one_or_none()
    if item:
        await db.delete(item)
        await db.commit()

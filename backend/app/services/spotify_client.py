"""
Spotify Web API client.

Wraps all Spotify API calls, handles token refresh automatically,
and maps responses to internal schema shapes.
"""

import asyncio
from datetime import datetime, timedelta, timezone

import httpx
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.config import settings
from app.models.user import User
from app.services.token_service import decrypt, encrypt

SPOTIFY_API_BASE = "https://api.spotify.com/v1"
SPOTIFY_TOKEN_URL = "https://accounts.spotify.com/api/token"


class SpotifyClient:
    def __init__(self, user: User, db: AsyncSession):
        self.user = user
        self.db = db

    async def _get_access_token(self) -> str:
        """Return a valid access token, refreshing if expired."""
        now = datetime.now(timezone.utc)
        expires_at = self.user.token_expires_at

        # Make it timezone-aware if stored as naive datetime
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)

        if expires_at <= now + timedelta(seconds=60):
            await self._refresh_token()

        return decrypt(self.user.access_token_enc)

    async def _refresh_token(self) -> None:
        refresh_token = decrypt(self.user.refresh_token_enc)

        def _sync_refresh() -> dict:
            with httpx.Client(timeout=30.0) as client:
                response = client.post(
                    SPOTIFY_TOKEN_URL,
                    data={
                        "grant_type": "refresh_token",
                        "refresh_token": refresh_token,
                    },
                    auth=(settings.spotify_client_id, settings.spotify_client_secret),
                )
                response.raise_for_status()
                return response.json()

        data = await asyncio.to_thread(_sync_refresh)

        self.user.access_token_enc = encrypt(data["access_token"])
        self.user.token_expires_at = datetime.now(timezone.utc) + timedelta(
            seconds=data["expires_in"]
        )
        # Spotify only returns a new refresh token if the old one is rotated
        if "refresh_token" in data:
            self.user.refresh_token_enc = encrypt(data["refresh_token"])

        self.db.add(self.user)
        await self.db.commit()

    async def _get(self, path: str, params: dict | None = None) -> dict:
        token = await self._get_access_token()

        def _sync_get() -> dict:
            with httpx.Client(timeout=30.0) as client:
                response = client.get(
                    f"{SPOTIFY_API_BASE}{path}",
                    headers={"Authorization": f"Bearer {token}"},
                    params=params or {},
                )
                if not response.is_success:
                    raise httpx.HTTPStatusError(
                        f"{response.status_code} from {path}: {response.text}",
                        request=response.request,
                        response=response,
                    )
                return response.json()

        return await asyncio.to_thread(_sync_get)

    async def get_profile(self) -> dict:
        return await self._get("/me")

    async def get_playlists(self, limit: int = 20, offset: int = 0) -> dict:
        data = await self._get("/me/playlists", {"limit": limit, "offset": offset})
        return {
            "items": [_map_playlist(p) for p in data["items"]],
            "total": data["total"],
            "limit": data["limit"],
            "offset": data["offset"],
        }

    async def get_playlist_tracks(
        self, playlist_id: str, limit: int = 20, offset: int = 0
    ) -> dict:
        try:
            data = await self._get(
                f"/playlists/{playlist_id}/tracks",
                {"limit": limit, "offset": offset, "fields": "items(track),total,limit,offset"},
            )
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 403:
                return {"items": [], "total": 0, "limit": limit, "offset": offset}
            raise
        tracks = [
            _map_track(item["track"])
            for item in data["items"]
            if item["track"] is not None  # local files have null track
        ]
        return {"items": tracks, "total": data["total"], "limit": limit, "offset": offset}

    async def search_tracks(self, query: str, limit: int = 10, offset: int = 0) -> dict:
        # Spotify caps search results at 10 for apps in development mode
        limit = min(limit, 10)
        data = await self._get(
            "/search",
            {"q": query, "type": "track", "limit": limit, "offset": offset},
        )
        tracks = data["tracks"]
        return {
            "items": [_map_track(t) for t in tracks["items"]],
            "total": tracks["total"],
            "limit": tracks["limit"],
            "offset": tracks["offset"],
        }

    async def get_track(self, spotify_track_id: str) -> dict:
        data = await self._get(f"/tracks/{spotify_track_id}")
        return _map_track(data)


def _map_playlist(p: dict) -> dict:
    images = p.get("images") or []
    tracks = p.get("tracks") or {}
    return {
        "id": p["id"],
        "name": p["name"],
        "track_count": tracks.get("total", 0),
        "image_url": images[0]["url"] if images else None,
    }


def _map_track(t: dict) -> dict:
    images = t.get("album", {}).get("images") or []
    artists = t.get("artists") or []
    return {
        "spotify_id": t["id"],
        "title": t["name"],
        "artist": ", ".join(a["name"] for a in artists),
        "album": t.get("album", {}).get("name"),
        "duration_ms": t.get("duration_ms"),
        "preview_url": t.get("preview_url"),
        "image_url": images[0]["url"] if images else None,
        "has_guitar": None,
    }

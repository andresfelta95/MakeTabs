"""
Spotify OAuth routes.

Flow:
  GET  /auth/login      → redirect to Spotify
  POST /auth/exchange   → frontend posts {code, state}, backend exchanges for tokens
  GET  /auth/logout     → clear session
  GET  /auth/me         → return current user
"""

import asyncio
import secrets
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models.user import User
from app.schemas.user import UserOut
from app.services.token_service import encrypt

router = APIRouter(prefix="/auth", tags=["auth"])

SPOTIFY_AUTH_URL = "https://accounts.spotify.com/authorize"
SPOTIFY_TOKEN_URL = "https://accounts.spotify.com/api/token"
SPOTIFY_SCOPES = " ".join([
    "user-read-private",
    "user-read-email",
    "playlist-read-private",
    "playlist-read-collaborative",
    "user-library-read",
])


def get_current_user_id(request: Request) -> str:
    user_id = request.session.get("user_id")
    if not user_id:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user_id


async def get_current_user(
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> User:
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


@router.get("/login")
async def login(request: Request):
    """Redirect user to Spotify authorization page."""
    state = secrets.token_urlsafe(16)
    request.session["oauth_state"] = state

    params = {
        "client_id": settings.spotify_client_id,
        "response_type": "code",
        "redirect_uri": settings.spotify_redirect_uri,
        "scope": SPOTIFY_SCOPES,
        "state": state,
    }
    return RedirectResponse(f"{SPOTIFY_AUTH_URL}?{urlencode(params)}")


class ExchangeRequest(BaseModel):
    code: str
    state: str


@router.post("/exchange", response_model=UserOut)
async def exchange(
    body: ExchangeRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Exchange authorization code sent by frontend after Spotify redirect."""
    stored_state = request.session.pop("oauth_state", None)
    if body.state != stored_state:
        raise HTTPException(status_code=400, detail="State mismatch")

    def _fetch_tokens() -> tuple[dict, dict]:
        with httpx.Client(timeout=30.0) as client:
            token_response = client.post(
                SPOTIFY_TOKEN_URL,
                data={
                    "grant_type": "authorization_code",
                    "code": body.code,
                    "redirect_uri": settings.spotify_redirect_uri,
                },
                auth=(settings.spotify_client_id, settings.spotify_client_secret),
            )
            token_response.raise_for_status()
            tkns = token_response.json()

            profile_response = client.get(
                "https://api.spotify.com/v1/me",
                headers={"Authorization": f"Bearer {tkns['access_token']}"},
            )
            profile_response.raise_for_status()
            return tkns, profile_response.json()

    tokens, profile = await asyncio.to_thread(_fetch_tokens)
    expires_at = datetime.now(timezone.utc) + timedelta(seconds=tokens["expires_in"])

    result = await db.execute(select(User).where(User.spotify_id == profile["id"]))
    user = result.scalar_one_or_none()

    if user is None:
        user = User(spotify_id=profile["id"])
        db.add(user)

    user.display_name = profile.get("display_name")
    user.email = profile.get("email")
    user.access_token_enc = encrypt(tokens["access_token"])
    user.refresh_token_enc = encrypt(tokens["refresh_token"])
    user.token_expires_at = expires_at

    await db.commit()
    await db.refresh(user)

    request.session["user_id"] = user.id
    return user


@router.get("/logout")
async def logout(request: Request):
    request.session.clear()
    return {"message": "Logged out"}


@router.get("/me", response_model=UserOut)
async def me(user: User = Depends(get_current_user)):
    return user

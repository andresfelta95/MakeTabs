from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.sessions import SessionMiddleware

from app.config import settings
from app.routes import auth, spotify, tabs

app = FastAPI(
    title="MakeTabs API",
    description="Generate guitar tabs from Spotify tracks",
    version="0.1.0",
)

app.add_middleware(
    SessionMiddleware,
    secret_key=settings.session_secret_key,
    session_cookie=settings.session_cookie_name,
    max_age=settings.session_max_age,
    same_site="lax",
    https_only=not settings.is_dev,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(spotify.router)
app.include_router(tabs.router)


@app.get("/health")
async def health():
    return {"status": "ok"}

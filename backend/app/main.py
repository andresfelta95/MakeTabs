import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import update
from starlette.middleware.sessions import SessionMiddleware

from app.config import settings
from app.database import engine
from app.models.chiptune import ChiptuneGeneration
from app.models.tab import TabGeneration
from app.routes import auth, chiptune, spotify, tabs

# uvicorn only configures its own loggers; without this the pipeline
# logger.info lines never reach docker logs.
logging.basicConfig(level=logging.INFO, format="%(levelname)s [%(name)s] %(message)s")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Reset any jobs that were left in 'processing' by a previous crash/restart
    async with engine.begin() as conn:
        await conn.execute(
            update(TabGeneration)
            .where(TabGeneration.status == "processing")
            .values(status="failed", error_message="Job interrupted by server restart")
        )
        await conn.execute(
            update(ChiptuneGeneration)
            .where(ChiptuneGeneration.status == "processing")
            .values(status="failed", error_message="Job interrupted by server restart")
        )
    yield


app = FastAPI(
    lifespan=lifespan,
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
app.include_router(chiptune.router)


@app.get("/health")
async def health():
    return {"status": "ok"}

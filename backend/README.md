# MakeTabs Backend

FastAPI backend for MakeTabs. Handles Spotify OAuth, proxies Spotify API calls,
and will run the audio processing pipeline (Phase 2).

## Setup

```bash
python -m venv venv
source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

## Configuration

```bash
cp .env.example .env
```

Fill in your `.env`:

| Variable | How to get it |
|----------|---------------|
| `SPOTIFY_CLIENT_ID` | Spotify Developer Dashboard |
| `SPOTIFY_CLIENT_SECRET` | Spotify Developer Dashboard |
| `SESSION_SECRET_KEY` | `python -c "import secrets; print(secrets.token_hex(32))"` |
| `ENCRYPTION_KEY` | `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"` |

See [../docs/spotify-integration.md](../docs/spotify-integration.md) for Spotify app setup.

## Database

```bash
# Create/migrate the database
alembic upgrade head

# Generate a new migration after model changes
alembic revision --autogenerate -m "describe change"
```

## Running

```bash
uvicorn app.main:app --reload \
  --ssl-certfile certs/localhost.pem \
  --ssl-keyfile certs/localhost-key.pem
```

API docs available at: http://localhost:8000/docs

## Project Structure

```
app/
├── main.py          # App entry point, middleware
├── config.py        # Settings (reads from .env)
├── database.py      # SQLAlchemy async engine + session
├── models/          # ORM models (users, tracks, tabs)
├── schemas/         # Pydantic request/response types
├── routes/          # API route handlers
│   ├── auth.py      # Spotify OAuth flow
│   ├── spotify.py   # Spotify proxy endpoints
│   └── tabs.py      # Tab generation endpoints
└── services/
    ├── spotify_client.py  # Spotify API wrapper + token refresh
    └── token_service.py   # Fernet encryption for stored tokens
```

## Phase 2: Audio Processing

When ready to implement tab generation, uncomment the audio deps in `requirements.txt`
and implement:

- `app/services/audio_processor.py` — yt-dlp download + Demucs source separation
- `app/services/transcriber.py` — basic-pitch MIDI transcription
- `app/services/tab_generator.py` — MIDI → tab JSON
- Background task queue (see `app/routes/tabs.py` TODO comment)

# MakeTabs

Any song → **guitar tabs** & **16-bit chiptunes**, from Spotify.

## What it does

1. Connect your Spotify account
2. Search any song (or browse your playlists)
3. Pick a format:
   - **🎸 Tabs** — transcribes the guitar (Songsterr-first, ML fallback: source
     separation + pitch transcription) into playable tabs with synced playback
   - **🕹️ 16-bit** — remakes the song as a chiptune (melody/harmony/bass, plus
     opt-in solo & drums) played on a Web Audio synth

UI is themed as a "backstage amp-rig" — see [docs/DESIGN.md](docs/DESIGN.md).
Before touching the pipelines or deploying, read
[docs/DOS_AND_DONTS.md](docs/DOS_AND_DONTS.md).

## Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React + Vite + TypeScript + TailwindCSS |
| Backend | Python 3.11+ + FastAPI |
| Auth | Spotify OAuth (Authorization Code flow) |
| Database | SQLite (local) → PostgreSQL (production) |
| ORM | SQLAlchemy + Alembic |
| Audio | yt-dlp + Demucs + basic-pitch |

## Project Structure

```
MakeTabs/
├── backend/       # FastAPI app
├── frontend/      # React app
└── docs/          # Architecture and integration docs
```

## Getting Started

### Prerequisites

- Python 3.11+
- Node.js 18+
- A Spotify Developer app (see [docs/spotify-integration.md](docs/spotify-integration.md))

### Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate       # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env            # fill in your Spotify credentials
alembic upgrade head            # run migrations
uvicorn app.main:app --reload
```

### Frontend

```bash
cd frontend
npm install
cp .env.example .env            # set VITE_API_URL=http://localhost:8000
npm run dev
```

## Documentation

- [Architecture](docs/architecture.md) — system design and data flow
- [API Reference](docs/api.md) — backend endpoints
- [Spotify Integration](docs/spotify-integration.md) — OAuth setup and API usage
- [Scalability Notes](docs/scalability.md) — what changes when going public

## Current Status

- [ ] Spotify OAuth + playlist/search (in progress)
- [ ] Audio download via yt-dlp
- [ ] Guitar detection (Demucs)
- [ ] Tab generation (basic-pitch)
- [ ] Tab renderer (React)

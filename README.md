# MakeTabs

Generate guitar tabs from Spotify tracks using audio ML.

## What it does

1. Connect your Spotify account
2. Browse your playlists or search for a song
3. MakeTabs checks if the track has guitar
4. If it does, generates guitar tabs using audio source separation and pitch transcription

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

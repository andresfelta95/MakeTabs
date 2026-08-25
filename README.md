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

## Deploy

Live at **https://tabs.paisbru.com** (note: `tabs`, not `maketabs`).

```bash
# rebuild + (re)start BOTH services
docker compose -f /home/server_pc/docker/compose/maketabs.yml up -d --build
```

- `maketabs-backend` — FastAPI on :8000, **8 GB limit + an NVIDIA GPU reservation**
  (Demucs and basic-pitch run on the GPU). Torch / basic-pitch model caches and
  generated audio live in named volumes so rebuilds don't re-download models.
- `maketabs-frontend` — static nginx on :80, 128 MB / 0.25 CPU.
- Secrets come from `/home/server_pc/docker/maketabs.env` (NOT in git).
- cloudflared routes `tabs.paisbru.com → maketabs-frontend:80`.

> Frontend and backend are separate images — rebuild the one(s) you changed.
> Editing source alone does nothing live until the image is rebuilt.

## Current Status

**Both pipelines are live in production.** Counts as of 2026-08-24:

| Feature | State |
|---|---|
| Spotify OAuth + search / playlists | ✅ done |
| Audio download (yt-dlp) | ✅ done |
| **Tabs — Songsterr path** | ✅ 53 tabs generated |
| **Tabs — ML fallback** (Demucs `htdemucs_6s` → basic-pitch) | ✅ 54 tabs generated, 10 failed |
| Tab renderer + synced playback (React) | ✅ done |
| **Chiptunes** (Songsterr path + Demucs 4-stem ML fallback) | ✅ 116 generated, 0 failed |
| Personal folders, multi-page library, filters | ✅ done |
| Lyrics (Genius) | ✅ done |

**Tab success rate: 107 / 117 (91%).** All 10 failures are on the ML fallback path.
By `error_message`:

| Failure | Count | Kind |
|---|---|---|
| `Job interrupted by server restart` | 4 | infrastructure |
| `Job orphaned by container restart` | 3 | infrastructure |
| numpy `inhomogeneous shape ... (3905, 5)` | 1 | pipeline bug |
| Demucs `htdemucs --two-stems` timed out after 900 s | 1 | pipeline bug |
| `list indices must be integers or slices, not tuple` | 1 | pipeline bug |

So **7 of 10 are just jobs killed mid-flight by a container restart**, not
transcription quality — they'd likely succeed on a re-run. Only 3 are real bugs.
There is no resume-on-restart: an in-flight job dies with the container. Chiptunes
have never failed (116/116).

Both pipelines are **Songsterr-first**: if Songsterr has the song, its MIDI is used
directly (fast, accurate); otherwise the audio is downloaded and run through source
separation + transcription. Tab algorithm version is tracked per generation
(`CURRENT_ALGORITHM`, currently `5.1.1`) so older tabs can be regenerated.

Production DB is **PostgreSQL** (`maketabs` on the shared `postgres` container),
not SQLite — SQLite is the local-dev default only.

### Not done yet

- [ ] Multi-user — the app works, but there's exactly **1 registered user**; nothing
      has been load-tested beyond a single account (see [docs/scalability.md](docs/scalability.md))
- [ ] Resume or auto-requeue jobs killed by a container restart (7 of 10 failures)
- [ ] Retry / regenerate UI for failed tabs
- [ ] Fix the 3 real pipeline bugs listed above (numpy shape, Demucs 900 s timeout,
      tuple indexing)
- [ ] Drums and solo are opt-in per chiptune; no per-instrument mixing UI

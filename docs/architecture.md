# Architecture

## Overview

MakeTabs is a local web app with a React frontend and FastAPI backend. The backend handles Spotify OAuth, audio processing, and tab generation. The frontend is a Spotify-connected browser + tab viewer.

## Data Flow

```
┌─────────────┐     OAuth      ┌─────────────┐     API      ┌──────────────┐
│    React    │ ─────────────▶ │   FastAPI   │ ───────────▶ │  Spotify API │
│  Frontend   │ ◀───────────── │   Backend   │ ◀─────────── │              │
└─────────────┘   session/JSON └─────────────┘              └──────────────┘
                                      │
                                      │ (on tab request)
                                      ▼
                               ┌─────────────┐
                               │   yt-dlp    │  ← downloads audio from YouTube
                               └─────────────┘
                                      │
                                      ▼
                               ┌─────────────┐
                               │    Demucs   │  ← separates guitar stem
                               └─────────────┘
                                      │
                                      ▼
                               ┌─────────────┐
                               │ basic-pitch │  ← audio → MIDI
                               └─────────────┘
                                      │
                                      ▼
                               ┌─────────────┐
                               │ Tab builder │  ← MIDI → tab JSON
                               └─────────────┘
                                      │
                                      ▼
                               ┌─────────────┐
                               │   SQLite    │  ← cached result
                               └─────────────┘
```

## Backend Structure

```
backend/app/
├── main.py              # FastAPI app entry point, middleware, CORS
├── config.py            # Settings from .env (Pydantic BaseSettings)
├── database.py          # SQLAlchemy engine + session factory
├── models/              # SQLAlchemy ORM models
│   ├── user.py          # User + Spotify token storage
│   ├── track.py         # Spotify track metadata cache
│   └── tab.py           # Tab generation jobs + results
├── schemas/             # Pydantic request/response schemas
│   ├── user.py
│   ├── track.py
│   └── tab.py
├── routes/              # FastAPI routers
│   ├── auth.py          # /auth/login, /auth/callback, /auth/logout, /auth/me
│   ├── spotify.py       # /spotify/playlists, /spotify/search, /spotify/track/{id}
│   └── tabs.py          # /tabs/generate, /tabs/{id}, /tabs/track/{spotify_id}
└── services/
    ├── spotify_client.py    # Wraps Spotify Web API calls
    ├── token_service.py     # Token encryption, refresh logic
    ├── audio_processor.py   # yt-dlp download + Demucs separation (Phase 2)
    ├── transcriber.py       # basic-pitch MIDI transcription (Phase 2)
    └── tab_generator.py     # MIDI → tab JSON (Phase 2)
```

## Frontend Structure

```
frontend/src/
├── App.tsx              # Router setup
├── pages/
│   ├── Login.tsx        # Spotify login button
│   ├── Home.tsx         # Playlist browser + search
│   └── TabViewer.tsx    # Tab display page
├── components/
│   ├── Layout.tsx       # App shell, nav
│   ├── SearchBar.tsx    # Spotify search input
│   ├── TrackCard.tsx    # Song card with "Generate tabs" action
│   ├── PlaylistList.tsx # User's Spotify playlists
│   └── PipelineStatus.tsx  # Job progress indicator
├── hooks/
│   ├── useAuth.ts       # Auth state + redirect logic
│   └── useSpotify.ts    # Playlist + search queries
├── api/
│   ├── client.ts        # Axios instance + interceptors
│   ├── auth.ts          # Auth API calls
│   └── spotify.ts       # Spotify proxy API calls
└── types/
    └── index.ts         # Shared TypeScript types
```

## Database Schema

```
users
  id            UUID  PK
  spotify_id    TEXT  UNIQUE
  display_name  TEXT
  access_token  TEXT  (encrypted)
  refresh_token TEXT  (encrypted)
  token_expires_at DATETIME
  created_at    DATETIME

tracks
  id            UUID  PK
  spotify_id    TEXT  UNIQUE
  title         TEXT
  artist        TEXT
  album         TEXT
  duration_ms   INTEGER
  preview_url   TEXT  (nullable)
  has_guitar    BOOLEAN (nullable - null means not yet analyzed)
  created_at    DATETIME

tab_generations
  id            UUID  PK
  track_id      UUID  FK → tracks
  status        TEXT  (pending|processing|done|failed)
  tab_data      JSON  (nullable until done)
  algorithm_version TEXT
  error_message TEXT  (nullable)
  created_at    DATETIME
  completed_at  DATETIME (nullable)

user_tab_requests
  id                UUID  PK
  user_id           UUID  FK → users
  track_id          UUID  FK → tracks
  tab_generation_id UUID  FK → tab_generations
  requested_at      DATETIME
```

## Tab JSON Format

```json
{
  "tuning": ["E", "A", "D", "G", "B", "e"],
  "bpm": 120,
  "sections": [
    {
      "name": "Intro",
      "measures": [
        {
          "notes": [
            { "string": 1, "fret": 0, "time": 0.0, "duration": 0.5 },
            { "string": 2, "fret": 2, "time": 0.5, "duration": 0.25 }
          ]
        }
      ]
    }
  ]
}
```

Storing structured JSON (not ASCII) keeps the data renderer-agnostic. The frontend decides how to display it.

## Auth Flow

```
1. User clicks "Login with Spotify"
2. Frontend calls GET /auth/login → backend redirects to Spotify OAuth
3. Spotify redirects to GET /auth/callback?code=...
4. Backend exchanges code for tokens, encrypts and stores in DB
5. Backend sets a session cookie and redirects to frontend
6. All subsequent Spotify calls go through the backend proxy
   (tokens never exposed to the browser)
```

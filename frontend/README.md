# MakeTabs Frontend

React + Vite + TypeScript frontend for MakeTabs.

## Stack

- **React 18** + **TypeScript**
- **Vite** — dev server + build
- **TailwindCSS** — styling (Spotify-inspired dark theme)
- **TanStack Query** — data fetching, caching, polling
- **React Router v7** — client-side routing
- **Axios** — HTTP client

## Setup

```bash
npm install
npm run dev   # starts at http://localhost:5173
```

The Vite dev server proxies `/auth`, `/spotify`, `/tabs` to `http://localhost:8000`,
so you don't need to configure CORS during development.

## Pages

| Route | Description |
|-------|-------------|
| `/login` | Spotify login button |
| `/` | Playlist browser + search |
| `/tabs/:jobId` | Tab viewer + pipeline status |

## Key Patterns

### Auth guard
`AuthGuard` in `App.tsx` wraps protected routes. It calls `GET /auth/me` — if the
session cookie is missing or expired, it redirects to `/login`.

### Polling
`useTabJob` in `hooks/useSpotify.ts` polls `GET /tabs/:jobId` every 2 seconds while
`status` is `pending` or `processing`. Stops automatically when done or failed.

### Search debounce
`SearchBar` debounces input by 400ms before triggering a query, to avoid hammering
the Spotify API on every keystroke.

## Styling

Colors are defined in `tailwind.config.js` under `theme.extend.colors.spotify`.
The design uses Spotify's actual dark palette:
- Background: `#121212`
- Cards: `#282828`
- Accent: `#1DB954` (Spotify green)

# API Reference

Base URL: `http://localhost:8000`

All endpoints return JSON. Auth endpoints set/read a session cookie (`maketabs_session`).

---

## Auth

### `GET /auth/login`
Redirects the browser to Spotify's OAuth authorization page.

**Response:** 302 redirect to Spotify

---

### `GET /auth/callback`
Spotify redirects here after user authorizes. Exchanges code for tokens, stores user, sets session cookie.

**Query params:** `code`, `state`
**Response:** 302 redirect to frontend `/`

---

### `GET /auth/logout`
Clears session cookie.

**Response:**
```json
{ "message": "Logged out" }
```

---

### `GET /auth/me`
Returns the current authenticated user.

**Auth:** session cookie required

**Response:**
```json
{
  "id": "uuid",
  "spotify_id": "spotify_user_id",
  "display_name": "Andre"
}
```

**Error:** `401` if not authenticated

---

## Spotify (proxied)

All endpoints require authentication (session cookie).

### `GET /spotify/playlists`
Returns the user's Spotify playlists.

**Query params:**
- `limit` (int, default 20, max 50)
- `offset` (int, default 0)

**Response:**
```json
{
  "items": [
    {
      "id": "spotify_playlist_id",
      "name": "My Playlist",
      "track_count": 42,
      "image_url": "https://..."
    }
  ],
  "total": 100,
  "limit": 20,
  "offset": 0
}
```

---

### `GET /spotify/playlists/{playlist_id}/tracks`
Returns tracks in a playlist.

**Query params:** `limit`, `offset`

**Response:**
```json
{
  "items": [
    {
      "spotify_id": "track_id",
      "title": "Comfortably Numb",
      "artist": "Pink Floyd",
      "album": "The Wall",
      "duration_ms": 382000,
      "preview_url": "https://...",
      "image_url": "https://..."
    }
  ],
  "total": 42
}
```

---

### `GET /spotify/search`
Searches Spotify tracks.

**Query params:**
- `q` (string, required) — search query
- `limit` (int, default 20)
- `offset` (int, default 0)

**Response:** same shape as playlist tracks

---

### `GET /spotify/tracks/{spotify_track_id}`
Returns a single track's metadata.

**Response:** single track object (same shape as above)

---

## Tabs

### `POST /tabs/generate`
Request tab generation for a track.

**Auth:** session cookie required

**Body:**
```json
{ "spotify_track_id": "track_id" }
```

**Response (job queued or already cached):**
```json
{
  "job_id": "uuid",
  "status": "pending|processing|done",
  "track": { "spotify_id": "...", "title": "...", "artist": "..." }
}
```

---

### `GET /tabs/{job_id}`
Poll a tab generation job's status.

**Response:**
```json
{
  "job_id": "uuid",
  "status": "pending|processing|done|failed",
  "has_guitar": true,
  "tab_data": { ... },
  "error": null
}
```

`tab_data` is `null` until status is `done`.
`has_guitar` is `null` until guitar detection finishes.

---

### `GET /tabs/track/{spotify_track_id}`
Get the cached tab for a track (if already generated).

**Response:** same as `GET /tabs/{job_id}` with `status: done`, or `404` if not generated yet.

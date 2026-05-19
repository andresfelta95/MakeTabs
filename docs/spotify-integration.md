# Spotify Integration

## Creating a Spotify Developer App

1. Go to [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. Click **Create app**
3. Fill in:
   - App name: `MakeTabs`
   - App description: `Personal guitar tab generator`
   - Redirect URI: `http://localhost:8000/auth/callback`
   - Select **Web API**
4. Save and copy your **Client ID** and **Client Secret** into `backend/.env`

## OAuth Flow

MakeTabs uses the **Authorization Code flow** (not PKCE) because the backend handles
the secret and proxies all Spotify API calls. Tokens are never exposed to the browser.

```
Frontend                Backend                 Spotify
   |                       |                       |
   |-- GET /auth/login --> |                       |
   |                       |-- redirect ---------> |
   |                       |                       |
   |                       |<-- ?code=xxx ---------|
   |                       |                       |
   |                       |-- POST /api/token --> |
   |                       |<-- access+refresh --- |
   |                       |                       |
   |                       | (store encrypted)     |
   |<-- session cookie ---- |                      |
```

## Required Scopes

| Scope | Why |
|-------|-----|
| `user-read-private` | Get user profile (display name, country) |
| `user-read-email` | Identify user account |
| `playlist-read-private` | Read user's private playlists |
| `playlist-read-collaborative` | Read collaborative playlists |
| `user-library-read` | Read saved/liked songs |

No playback scopes are needed — MakeTabs uses yt-dlp for audio, not Spotify playback.

## Token Management

- Access tokens expire after **1 hour**
- The backend automatically refreshes using the stored refresh token before each API call
- Tokens are encrypted at rest using **Fernet** symmetric encryption
- The encryption key is in `ENCRYPTION_KEY` in `.env` (generate with `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"`)

## API Endpoints Used

| Endpoint | Used for |
|----------|---------|
| `GET /v1/me` | User profile |
| `GET /v1/me/playlists` | User's playlists |
| `GET /v1/playlists/{id}/tracks` | Tracks in a playlist |
| `GET /v1/search?type=track` | Search songs |
| `GET /v1/tracks/{id}` | Single track metadata |
| `GET /v1/audio-features/{id}` | Audio features (tempo, energy, etc.) |

## Rate Limits

Spotify enforces rate limits. When a 429 is returned, the `Retry-After` header
indicates how many seconds to wait. The `SpotifyClient` service handles this automatically.

## Notes for Going Public

- Register a proper redirect URI for your production domain
- Spotify requires app review to access certain scopes beyond 25 users (quota extension)
- Request quota extension at: Developer Dashboard → your app → Edit → Request Extension
- For full track playback (future feature), you'd need `streaming` scope + Spotify Premium users

# Scalability Notes

This document tracks what needs to change when MakeTabs goes from a personal local
tool to a public multi-user application.

---

## Database

| Now (local) | Public |
|-------------|--------|
| SQLite | PostgreSQL |
| No encryption key rotation | KMS-managed encryption keys |
| Single DB file | Connection pooling (PgBouncer) |

**Migration path:** SQLAlchemy + Alembic are already in place. Switching to Postgres
is a one-line change in `DATABASE_URL` — no ORM code changes needed.

Use `JSONB` instead of `JSON` for `tab_data` in Postgres for indexed queries.

---

## Audio Processing

| Now (local) | Public |
|-------------|--------|
| Synchronous (blocks request) | Async job queue (Celery + Redis or RQ) |
| Files on local disk | Object storage (S3 / R2) |
| yt-dlp (personal use) | Licensed audio source |

**Queue pattern:**
```
POST /tabs/generate → create job row (pending) → enqueue task → return job_id
Worker picks up task → downloads audio → processes → updates job row
Frontend polls GET /tabs/{job_id} until status = done
```

Consider adding WebSocket or SSE for real-time status updates instead of polling.

---

## Auth & Security

| Now (local) | Public |
|-------------|--------|
| Single hardcoded user | Multi-user, proper sessions |
| Fernet encryption (simple) | KMS or Vault for token encryption |
| No rate limiting | Per-user rate limiting (slowapi) |
| HTTP locally | HTTPS (TLS termination at reverse proxy) |

---

## Spotify API

- **Quota extension:** By default, Spotify apps are in "Development mode" (25 users max).
  Submit a quota extension request via the Developer Dashboard for public access.
- **Scopes review:** Spotify reviews apps that request certain sensitive scopes.
- **Rate limits:** With many users, implement a per-user request queue to avoid 429s.
- **Token storage:** Refresh tokens are long-lived — treat them like passwords.

---

## Infrastructure

Suggested production stack:

```
Browser → Nginx (TLS) → FastAPI (uvicorn workers)
                              ↓
                         PostgreSQL
                              ↓
                         Redis → Celery workers (audio processing)
                                       ↓
                                    S3/R2 (audio files)
```

Docker Compose is already set up for local dev. For production, consider:
- **Railway / Render** for simple deploys
- **AWS ECS / Fly.io** for more control
- **Supabase** as a managed Postgres option

---

## Caching Strategy

Tabs are deterministic per track — the same Spotify track ID always produces the
same output (given the same algorithm version). This means:

- Cache aggressively by `spotify_track_id`
- Invalidate cache when `algorithm_version` changes (re-run all tabs on next request)
- CDN-cache the tab JSON response for public endpoints

---

## Legal / ToS Considerations

- **yt-dlp:** Acceptable for personal use; not suitable for a hosted public service.
  Need a licensed audio source for production (ACRCloud, etc.).
- **Spotify API ToS:** Review Section 4 (Restrictions) before going public.
  Key restriction: do not cache audio content; tab data is your own derived work.
- **Copyright:** Generated tabs are a grey area. Many tab sites operate under
  licensing arrangements with publishers (e.g., NMPA). Research before monetizing.

"""
Songsterr client — fetches official tab data without a headless browser.

Three endpoints:
  1. /api/search?pattern=…   → list of song matches with songId
  2. /a/wsa/tab-s{songId}    → HTML with <script id="state"> containing revisionId,
                                image hash, and per-track partId
  3. CDN (backup mirror)     → /{songId}/{revisionId}/{image}/{partId}.json
                                = full measures/voices/beats/notes payload

The primary CDN (dqsljvtekg760.cloudfront.net) returns 403 for revisions Songsterr
moved to its new "staging" image pipeline, so we always hit the backup mirror
(d3d3l6a6rcgkaf.cloudfront.net) first. Both URLs were taken from the public
songsterr-downloader project; verified live 2026-05-24.
"""

from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass

import httpx

logger = logging.getLogger(__name__)

_API_BASE = "https://www.songsterr.com"
_CDN_PRIMARY = "https://dqsljvtekg760.cloudfront.net"
_CDN_BACKUP = "https://d3d3l6a6rcgkaf.cloudfront.net"

# Songsterr's CDN requires a browser-like Origin/Referer and rejects empty UAs.
_BROWSER_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    "Origin": "https://www.songsterr.com",
    "Referer": "https://www.songsterr.com/",
}

_STATE_SCRIPT_RE = re.compile(
    r'<script[^>]*id="state"[^>]*>(.+?)</script>', re.DOTALL
)


@dataclass
class SongsterrTrack:
    part_id: int
    hash: str
    instrument: str
    instrument_id: int
    name: str
    tuning: list[int]
    is_guitar: bool
    is_bass: bool
    is_drums: bool
    is_vocal: bool
    is_empty: bool


@dataclass
class SongsterrSong:
    song_id: int
    revision_id: int
    image: str
    artist: str
    title: str
    tracks: list[SongsterrTrack]
    # Songsterr's own ranking — partId of the track to show by default and the
    # most-popular guitar track. Used to order tracks in the UI.
    default_track: int | None = None
    popular_track_guitar: int | None = None


class SongsterrNotFound(Exception):
    pass


class SongsterrClient:
    """Synchronous client — meant to be called from inside a worker thread."""

    def __init__(self, timeout: float = 15.0) -> None:
        self._client = httpx.Client(headers=_BROWSER_HEADERS, timeout=timeout, follow_redirects=True)

    def close(self) -> None:
        self._client.close()

    def __enter__(self) -> "SongsterrClient":
        return self

    def __exit__(self, *_exc) -> None:
        self.close()

    # ── search ──────────────────────────────────────────────────────────────

    def search(self, artist: str, title: str, size: int = 8) -> list[dict]:
        """Search Songsterr; returns the raw `records` list ranked by Songsterr."""
        pattern = f"{artist} {title}".strip()
        resp = self._client.get(f"{_API_BASE}/api/search", params={"pattern": pattern, "size": size})
        if resp.status_code != 200:
            logger.warning("Songsterr search failed: %s — %s", resp.status_code, resp.text[:200])
            return []
        data = resp.json()
        # Endpoint sometimes returns {"records": [...]} and sometimes a bare list.
        return data.get("records", data) if isinstance(data, dict) else data

    def pick_best_match(
        self, results: list[dict], artist: str, title: str
    ) -> dict | None:
        """Pick the Songsterr record that best matches the requested artist/title."""
        if not results:
            return None

        norm = lambda s: re.sub(r"[^a-z0-9]+", "", (s or "").lower())
        want_a, want_t = norm(artist), norm(title)

        scored = []
        for r in results:
            r_a = norm(r.get("artist", ""))
            r_t = norm(r.get("title", ""))
            artist_match = want_a == r_a or want_a in r_a or r_a in want_a
            title_match = want_t == r_t or want_t in r_t or r_t in want_t
            has_guitar = any(
                "guitar" in (t.get("instrument", "") or "").lower()
                and not t.get("isEmpty", False)
                for t in r.get("tracks", [])
            )
            score = (int(artist_match) * 2 + int(title_match) * 2 + int(has_guitar))
            scored.append((score, r))

        scored.sort(key=lambda x: -x[0])
        best_score, best = scored[0]
        if best_score < 2:
            # Need at least artist or title to match — otherwise it's a wrong song.
            return None
        return best

    # ── state meta (HTML scrape — only way to get partId) ───────────────────

    def get_state_meta(self, song_id: int) -> SongsterrSong:
        """Load the tab page and parse its <script id="state"> JSON."""
        # tab-s{id} resolves to the canonical /a/wsa/{slug}-tab-s{id} URL.
        url = f"{_API_BASE}/a/wsa/tab-s{song_id}"
        resp = self._client.get(url)
        if resp.status_code != 200:
            raise SongsterrNotFound(f"Tab page returned {resp.status_code} for songId {song_id}")

        match = _STATE_SCRIPT_RE.search(resp.text)
        if not match:
            raise SongsterrNotFound(f"No <script id=\"state\"> on page for songId {song_id}")

        try:
            state = json.loads(match.group(1))
        except json.JSONDecodeError as e:
            raise SongsterrNotFound(f"Malformed state JSON: {e}") from e

        current = (state or {}).get("meta", {}).get("current")
        if not current or not current.get("songId") or not current.get("revisionId") or not current.get("image"):
            raise SongsterrNotFound("State payload missing required fields")

        tracks: list[SongsterrTrack] = []
        for i, t in enumerate(current.get("tracks", [])):
            tracks.append(SongsterrTrack(
                part_id=t.get("partId", i),
                hash=t.get("hash", ""),
                instrument=t.get("instrument", ""),
                instrument_id=int(t.get("instrumentId", 0)),
                name=t.get("name", ""),
                tuning=list(t.get("tuning", [])),
                is_guitar=bool(t.get("isGuitar")),
                is_bass=bool(t.get("isBassGuitar")),
                is_drums=bool(t.get("isDrums")),
                is_vocal=bool(t.get("isVocalTrack")),
                is_empty=bool(t.get("isEmpty")),
            ))

        def _opt_int(v) -> int | None:
            try:
                return int(v) if v is not None else None
            except (TypeError, ValueError):
                return None

        return SongsterrSong(
            song_id=int(current["songId"]),
            revision_id=int(current["revisionId"]),
            image=str(current["image"]),
            artist=str(current.get("artist", "")),
            title=str(current.get("title", "")),
            tracks=tracks,
            default_track=_opt_int(current.get("defaultTrack")),
            popular_track_guitar=_opt_int(current.get("popularTrackGuitar")),
        )

    # ── track data (the actual measures/notes payload) ──────────────────────

    def get_track_data(
        self, song_id: int, revision_id: int, image: str, part_id: int
    ) -> dict:
        """Fetch the per-track revision JSON. Tries backup CDN first (it serves
        new "staged" revisions that the primary 403s on), then primary as fallback."""
        path = f"/{song_id}/{revision_id}/{image}/{part_id}.json"
        for base in (_CDN_BACKUP, _CDN_PRIMARY):
            resp = self._client.get(f"{base}{path}")
            if resp.status_code == 200:
                return resp.json()
            logger.debug("CDN %s returned %s for %s", base, resp.status_code, path)
        raise SongsterrNotFound(f"No CDN served {path}")

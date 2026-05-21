"""Fetch and parse song lyrics from Genius via the official API + page scraping."""

import logging
import re

import requests

logger = logging.getLogger(__name__)

_HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; MakeTabs/1.0)"}


def fetch_lyrics_sections(title: str, artist: str, access_token: str) -> list[dict]:
    """Return parsed lyrics sections [{"name": str, "text": str}], or [] on failure."""
    try:
        song_url = _search_genius(title, artist, access_token)
        if not song_url:
            return []
        lyrics = _scrape_lyrics(song_url)
        if not lyrics:
            return []
        return _parse_sections(lyrics)
    except Exception:
        logger.exception("Genius fetch failed for %s — %s", artist, title)
        return []


def _search_genius(title: str, artist: str, access_token: str) -> str | None:
    """Return the Genius song page URL, or None if not found."""
    r = requests.get(
        "https://api.genius.com/search",
        params={"q": f"{title} {artist}"},
        headers={"Authorization": f"Bearer {access_token}"},
        timeout=15,
    )
    r.raise_for_status()
    hits = r.json().get("response", {}).get("hits", [])
    if not hits:
        logger.info("Genius: no match for %s — %s", artist, title)
        return None
    return hits[0]["result"]["url"]


def _scrape_lyrics(song_url: str) -> str:
    """Fetch a Genius song page and extract the raw lyrics text."""
    from bs4 import BeautifulSoup

    page = requests.get(song_url, headers=_HEADERS, timeout=20)
    page.raise_for_status()

    soup = BeautifulSoup(page.text, "html.parser")
    containers = soup.find_all("div", attrs={"data-lyrics-container": "true"})
    if not containers:
        return ""

    lines: list[str] = []
    for container in containers:
        for node in container.descendants:
            if getattr(node, "name", None) == "br":
                lines.append("")
            elif node.name is None:  # text node
                text = str(node).strip()
                if text:
                    lines.append(text)
        lines.append("")

    return "\n".join(lines)


def _parse_sections(lyrics: str) -> list[dict]:
    sections: list[dict] = []
    current_name = "Intro"
    current_lines: list[str] = []

    for line in lyrics.splitlines():
        line = line.strip()
        m = re.match(r"^\[(.+?)\]$", line)
        if m:
            if current_lines:
                sections.append({"name": current_name, "text": "\n".join(current_lines)})
            current_name = m.group(1)
            current_lines = []
        elif line:
            current_lines.append(line)

    if current_lines:
        sections.append({"name": current_name, "text": "\n".join(current_lines)})

    return sections

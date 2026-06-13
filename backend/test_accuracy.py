"""Chiptune accuracy harness: compare generated chiptune_data against the real
song's audio using chroma analysis.

For each test song:
  1. Build chiptune_data through the real Songsterr path (cached in .diag_cache).
  2. Download the actual audio with yt-dlp (cached as .diag_cache/<slug>.wav).
  3. Compute the audio's chromagram and, per channel, the fraction of chiptune
     note-frames whose pitch class is in the audio's top-3 chroma bins at that
     moment ("hit rate"). Alignment is searched over start offset and a small
     tempo scale so a YouTube intro or BPM rounding doesn't tank the score.

A wrong-octave note still scores (chroma is octave-free) but a wrong PITCH
doesn't, which is exactly what we want for "is the melody the actual song".

Run inside the backend image (network needed for first run):
  docker run --rm -v .:/app -w /app --entrypoint python compose-maketabs-backend test_accuracy.py
"""

import json
import sys
from pathlib import Path

import numpy as np

CACHE = Path(".diag_cache")
CACHE.mkdir(exist_ok=True)

SONGS = [
    ("Green Day", "Basket Case"),
    ("Green Day", "American Idiot"),
    ("Green Day", "Boulevard of Broken Dreams"),
    ("Sum 41", "Walking Disaster"),
    ("Sum 41", "In Too Deep"),
    ("blink-182", "All the Small Things"),
    ("The Offspring", "Self Esteem"),
    ("Weezer", "Buddy Holly"),
]

_SR = 22050
_HOP = 2048  # ~93 ms frames


def _slug(artist, title):
    return f"{artist}_{title}".lower().replace(" ", "_")


def build_data(artist, title):
    from diag_chiptune import fetch_song
    from app.services.songsterr_to_chiptune import build_chiptune_data

    state, tracks = fetch_song(artist, title)
    if state is None:
        return None
    return build_chiptune_data(state, tracks)


def get_audio_chroma(artist, title):
    import librosa

    wav = CACHE / f"{_slug(artist, title)}.wav"
    npy = CACHE / f"{_slug(artist, title)}_chroma.npy"
    if npy.exists():
        return np.load(npy)
    if not wav.exists():
        import yt_dlp
        ydl_opts = {
            "format": "bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio/best",
            "outtmpl": str(wav.with_suffix("")) + ".%(ext)s",
            "postprocessors": [{"key": "FFmpegExtractAudio", "preferredcodec": "wav"}],
            "quiet": True, "no_warnings": True, "noplaylist": True,
            "extractor_args": {"youtube": {"skip": ["dash", "hls"]}},
        }
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.download([f"ytsearch1:{artist} - {title} official audio"])
        if not wav.exists():
            raise FileNotFoundError(f"yt-dlp produced no {wav}")
    y, sr = librosa.load(str(wav), sr=_SR, mono=True)
    chroma = librosa.feature.chroma_cqt(y=y, sr=sr, hop_length=_HOP)
    np.save(npy, chroma.astype(np.float32))
    return chroma


def chiptune_notes(data):
    """{channel: [(t_seconds, dur_seconds, pitch_class)]} from chiptune_data."""
    spm = data.get("slots_per_measure", 16)  # slots per measure (16 on old jobs)
    slot_dur = (60.0 / data["bpm"]) / (spm / 4.0)
    out = {}
    for chan in ("melody", "harmony", "bass"):
        notes = []
        secs = data["tracks"][chan]["sections"]
        g_measure = 0
        for sec in secs:
            for m in sec["measures"]:
                for n in m["notes"]:
                    slot = g_measure * spm + n["beat"]
                    notes.append((slot * slot_dur, n.get("dur", 1.0) * slot_dur, n["pitch"] % 12))
                g_measure += 1
        out[chan] = notes
    return out


def hit_rate(notes, top3, offset, scale):
    """Fraction of note-frames whose pitch class is in the audio top-3 chroma."""
    if not notes:
        return 0.0
    frame_dur = _HOP / _SR
    n_frames = top3.shape[1]
    hits = total = 0
    for t, dur, pc in notes:
        f0 = int((t * scale + offset) / frame_dur)
        f1 = int((t * scale + offset + min(dur, 1.5)) / frame_dur) + 1
        f0, f1 = max(0, f0), min(n_frames, f1)
        if f1 <= f0:
            continue
        hits += top3[pc, f0:f1].sum()
        total += f1 - f0
    return hits / total if total else 0.0


def score_song(data, chroma):
    """Best-aligned hit rates per channel. Alignment maximizes melody+bass."""
    order = np.argsort(-chroma, axis=0)
    top3 = np.zeros_like(chroma, dtype=bool)
    for k in range(3):
        top3[order[k], np.arange(chroma.shape[1])] = True

    notes = chiptune_notes(data)
    align_notes = notes["melody"] + notes["bass"]
    best = (-1.0, 0.0, 1.0)
    for scale in (0.97, 0.98, 0.99, 1.0, 1.01, 1.02, 1.03):
        for offset in np.arange(-2.0, 12.0, 0.25):
            s = hit_rate(align_notes, top3, offset, scale)
            if s > best[0]:
                best = (s, offset, scale)
    _, offset, scale = best
    return {
        "offset": offset, "scale": scale,
        **{ch: hit_rate(notes[ch], top3, offset, scale) for ch in ("melody", "harmony", "bass")},
        "melody_notes": len(notes["melody"]),
    }


def main():
    rows = []
    for artist, title in SONGS:
        name = f"{artist} — {title}"
        try:
            data = build_data(artist, title)
            if data is None:
                print(f"{name}: no Songsterr data")
                continue
            chroma = get_audio_chroma(artist, title)
            s = score_song(data, chroma)
            rows.append((name, s))
            print(f"{name:45s} melody={s['melody']:.0%} harmony={s['harmony']:.0%} "
                  f"bass={s['bass']:.0%} (n={s['melody_notes']}, off={s['offset']:+.2f}s, "
                  f"scale={s['scale']})")
        except Exception as e:
            print(f"{name}: FAILED — {type(e).__name__}: {e}")

    if rows:
        avg = {ch: float(np.mean([s[ch] for _, s in rows])) for ch in ("melody", "harmony", "bass")}
        print(f"\n{'AVERAGE':45s} melody={avg['melody']:.0%} harmony={avg['harmony']:.0%} bass={avg['bass']:.0%}")


if __name__ == "__main__":
    main()

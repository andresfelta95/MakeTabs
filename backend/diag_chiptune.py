"""Diagnostic: run the real Songsterr → chiptune path on a set of songs and
report melody quality (source track, coverage, pitch range, suspicious gaps),
plus structural features of the raw Songsterr JSON we might be mishandling
(repeats, alternate endings, multi-voice vocals, tempo automation shapes).

Run inside the backend image:
  docker run --rm -v .:/app -w /app --entrypoint python compose-maketabs-backend diag_chiptune.py
"""

import json
import logging
import sys
import time
from pathlib import Path

from app.services.songsterr_client import SongsterrClient
from app.services.songsterr_to_chiptune import (
    _collect_notes_abs,
    _dominant_bpm,
    _measure_times,
    build_chiptune_data,
)

logging.basicConfig(level=logging.INFO, format="  LOG %(message)s")

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


def fetch_song(artist, title):
    """Returns (state, [(track, json)]) using a disk cache to be polite."""
    slug = f"{artist}_{title}".lower().replace(" ", "_")
    cache_file = CACHE / f"{slug}.json"
    if cache_file.exists():
        blob = json.loads(cache_file.read_text())
        from app.services.songsterr_client import SongsterrSong, SongsterrTrack
        state = SongsterrSong(
            tracks=[SongsterrTrack(**t) for t in blob["state"].pop("tracks")],
            **blob["state"],
        )
        tracks = []
        by_part = {t.part_id: t for t in state.tracks}
        for part_id_str, data in blob["tracks"].items():
            tracks.append((by_part[int(part_id_str)], data))
        return state, tracks

    with SongsterrClient() as client:
        results = client.search(artist, title)
        best = client.pick_best_match(results, artist, title)
        if not best:
            return None, None
        state = client.get_state_meta(int(best["songId"]))
        tracks = []
        for t in state.tracks:
            if t.is_empty:
                continue
            try:
                data = client.get_track_data(state.song_id, state.revision_id, state.image, t.part_id)
            except Exception as e:
                print(f"    ! part {t.part_id} fetch failed: {e}")
                continue
            tracks.append((t, data))
            time.sleep(0.3)

    blob = {
        "state": {
            "song_id": state.song_id, "revision_id": state.revision_id,
            "image": state.image, "artist": state.artist, "title": state.title,
            "default_track": state.default_track,
            "popular_track_guitar": state.popular_track_guitar,
            "tracks": [vars(t) for t in state.tracks],
        },
        "tracks": {str(t.part_id): d for t, d in tracks},
    }
    cache_file.write_text(json.dumps(blob))
    return state, tracks


def note_count(tj):
    n = 0
    for m in tj.get("measures", []) or []:
        for v in m.get("voices", []) or []:
            for b in v.get("beats", []) or []:
                if not b.get("rest"):
                    n += sum(1 for nt in (b.get("notes") or []) if not nt.get("rest") and "fret" in nt)
    return n


def structural_report(tj):
    """Which structural features appear in this track's measures?"""
    measure_keys = set()
    note_keys = set()
    beat_keys = set()
    max_voices = 0
    for m in tj.get("measures", []) or []:
        measure_keys.update(m.keys())
        max_voices = max(max_voices, len(m.get("voices") or []))
        for v in m.get("voices", []) or []:
            for b in v.get("beats", []) or []:
                beat_keys.update(b.keys())
                for nt in b.get("notes") or []:
                    note_keys.update(nt.keys())
    return measure_keys, beat_keys, note_keys, max_voices


def melody_report(data):
    """Coverage stats for the melody channel."""
    secs = data["tracks"]["melody"]["sections"]
    measures = [m["notes"] for s in secs for m in s["measures"]]
    total = len(measures)
    filled = sum(1 for m in measures if m)
    pitches = [n["pitch"] for m in measures for n in m]
    notes = len(pitches)
    # longest run of empty measures inside the filled span
    first = next((i for i, m in enumerate(measures) if m), None)
    last = next((total - 1 - i for i, m in enumerate(reversed(measures)) if m), None)
    longest_gap = 0
    if first is not None:
        run = 0
        for m in measures[first:last + 1]:
            if not m:
                run += 1
                longest_gap = max(longest_gap, run)
            else:
                run = 0
    return {
        "measures": total, "filled": filled, "notes": notes,
        "coverage": filled / total if total else 0,
        "pitch_min": min(pitches) if pitches else None,
        "pitch_max": max(pitches) if pitches else None,
        "longest_interior_gap": longest_gap,
        "first_filled": first, "last_filled": last,
    }


def main():
    for artist, title in SONGS:
        print(f"\n{'='*70}\n{artist} — {title}")
        try:
            state, tracks = fetch_song(artist, title)
        except Exception as e:
            print(f"  FETCH FAILED: {e}")
            continue
        if state is None:
            print("  no Songsterr match")
            continue
        print(f"  matched: {state.artist} — {state.title} (song {state.song_id})")
        for t, d in tracks:
            flags = "".join([
                "V" if t.is_vocal else "-", "G" if t.is_guitar else "-",
                "B" if t.is_bass else "-", "D" if t.is_drums else "-",
            ])
            mk, bk, nk, mv = structural_report(d)
            interesting_mk = mk - {"signature", "voices", "index"}
            interesting_nk = nk - {"string", "fret", "rest"}
            autos = (d.get("automations") or {}).get("tempo") or []
            print(f"  [{flags}] part={t.part_id:<3} inst={t.instrument:<22} name={t.name!r:<28} "
                  f"notes={note_count(d):<5} voices<={mv} tempo_autos={len(autos)}")
            if interesting_mk:
                print(f"        measure keys: {sorted(interesting_mk)}")
            if interesting_nk:
                print(f"        note keys: {sorted(interesting_nk)}")

        data = build_chiptune_data(state, tracks)
        if data is None:
            print("  BUILD RETURNED None")
            continue
        rep = melody_report(data)
        bpm = data["bpm"]
        secs_per_measure = 4 * 60.0 / bpm
        print(f"  chiptune: bpm={bpm} measures={rep['measures']} (~{rep['measures']*secs_per_measure:.0f}s)")
        print(f"  melody: coverage={rep['coverage']:.0%} notes={rep['notes']} "
              f"pitch=[{rep['pitch_min']},{rep['pitch_max']}] "
              f"longest interior gap={rep['longest_interior_gap']} measures "
              f"span=[{rep['first_filled']},{rep['last_filled']}]")

        # Where do melody notes get lost? Trace the chosen vocal track through
        # the same steps the converter takes.
        vocals = [(t, d) for t, d in tracks if t.is_vocal and note_count(d) > 0]
        if vocals:
            vt, vd = max(vocals, key=lambda p: note_count(p[1]))
            ref = vd  # converter uses its own ref; close enough for tempo-map shape
            candidates_ref = [d for _, d in tracks if (d.get("automations") or {}).get("tempo")]
            ref = max(candidates_ref or [d for _, d in tracks],
                      key=lambda d: len(d.get("measures") or []))
            starts, quarter_s = _measure_times(ref)
            abs_notes = _collect_notes_abs(vd, False, starts, quarter_s)
            n_measures_vocal = len(vd.get("measures") or [])
            n_measures_ref = len(ref.get("measures") or [])
            print(f"  vocal trace: track={vt.name!r} raw_notes={note_count(vd)} "
                  f"after_collect={len(abs_notes)} "
                  f"vocal_measures={n_measures_vocal} ref_measures={n_measures_ref} "
                  f"tempo_map_end={starts[-1]:.0f}s")
            if abs_notes:
                ts = [n[0] for n in abs_notes]
                print(f"  vocal trace: first_note={min(ts):.1f}s last_note={max(ts):.1f}s")


if __name__ == "__main__":
    main()

"""
Convert Songsterr track payloads into:
  • `tab_data` in MakeTabs' display schema (same shape as the ML pipeline output)
  • a multitrack MIDI file with exact timings, for synthesis to MP3

Songsterr quirks worth knowing:
  - Strings are numbered HIGH→LOW (string 1 = high e). MakeTabs is LOW→HIGH, so
    we mirror: `mt_string = (strings_count + 1) - ss_string`.
  - `instrumentId` matches GM program number (0-indexed). We pass it straight
    through as the MIDI program change.
  - Beat `duration` is `[num, den]`; `type` is just `den`. We always derive ticks
    from `duration` so dotted/tuplet beats stay correct.
  - Non-4/4 measures are scaled to fit the fixed 16-slot display grid so the
    frontend doesn't need to know about time signatures.
"""

from __future__ import annotations

import io
import logging
from dataclasses import dataclass

from app.services.songsterr_client import SongsterrSong, SongsterrTrack

logger = logging.getLogger(__name__)

# MakeTabs display grid (must match audio_pipeline.py)
_BEATS_PER_MEASURE = 16
_MEASURES_PER_SECTION = 4

# MIDI synthesis grid: 480 ticks per quarter note is a Guitar Pro-ish default.
_PPQ = 480


# ── helpers ─────────────────────────────────────────────────────────────────

def _beat_duration_quarters(beat: dict) -> float:
    """Return beat duration as fraction of a quarter note."""
    dur = beat.get("duration")
    if isinstance(dur, list) and len(dur) == 2 and dur[1]:
        # duration is [num, den] relative to a whole note: quarters = 4 * num/den
        quarters = 4.0 * (dur[0] / dur[1])
    else:
        # Fallback: 'type' is the denominator
        t = beat.get("type") or 4
        quarters = 4.0 / t
    if beat.get("dots"):
        quarters *= 1.5 ** int(beat["dots"])
    tup = beat.get("tuplet")
    if isinstance(tup, dict) and tup.get("n") and tup.get("m"):
        quarters *= tup["m"] / tup["n"]
    return quarters


def _measure_quarters(measure: dict) -> float:
    """Length of a measure in quarter-notes, from its time signature."""
    sig = measure.get("signature") or [4, 4]
    num, den = sig[0], sig[1] if len(sig) > 1 else 4
    return 4.0 * num / den


def _string_base(track_json: dict) -> int:
    """Songsterr CDN track JSON numbers strings from 0 (string 0 = highest
    string); only some very old revisions are 1-based. A track that uses
    string 0 must be 0-based; one that reaches string == len(tuning) must be
    1-based; anything else defaults to 0-based (verified against the chroma
    of real recordings — see test_accuracy.py)."""
    n_strings = len(track_json.get("tuning") or []) or int(track_json.get("strings") or 6)
    saw_max = False
    for m in track_json.get("measures", []) or []:
        for v in m.get("voices", []) or []:
            for b in v.get("beats", []) or []:
                for nt in b.get("notes", []) or []:
                    s = nt.get("string")
                    if s == 0:
                        return 0
                    if s is not None and int(s) >= n_strings:
                        saw_max = True
    return 1 if saw_max else 0


def _tuning_to_names(tuning: list[int]) -> list[str]:
    """MIDI pitches (Songsterr high→low) → note names (MakeTabs low→high).

    The existing ML pipeline uses lowercase for the highest string ("e") so the
    display can tell apart low E and high E. We follow the same convention.
    """
    names_sharp = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
    reversed_tuning = list(reversed(tuning))
    out = [names_sharp[p % 12] for p in reversed_tuning]
    if len(out) >= 2 and out[-1] == out[0]:
        out[-1] = out[-1].lower()
    return out


# ── tab_data builder (matches audio_pipeline.py format) ─────────────────────

def _build_track_sections(
    track_meta: SongsterrTrack,
    track_json: dict,
) -> list[dict]:
    """Build the [{"name", "measures": [{"notes": [...]}]}, ...] sections list
    for a single Songsterr guitar track."""
    strings_count = track_json.get("strings") or len(track_meta.tuning) or 6
    string_base = _string_base(track_json)
    measures = track_json.get("measures", [])

    notes_by_measure: list[list[dict]] = []
    for measure in measures:
        m_qtrs = _measure_quarters(measure)
        scale = _BEATS_PER_MEASURE / max(m_qtrs * 4, 1)  # ticks-per-16th in this measure
        measure_notes: list[dict] = []
        position = 0.0  # in quarter notes

        for voice in measure.get("voices", []) or []:
            voice_pos = position
            for beat in voice.get("beats", []) or []:
                beat_qtrs = _beat_duration_quarters(beat)
                if not beat.get("rest"):
                    for note in beat.get("notes", []) or []:
                        if note.get("rest"):
                            continue
                        if "string" not in note or "fret" not in note:
                            continue
                        # Songsterr high→low (usually 0-indexed) → MakeTabs 1-indexed low→high
                        ss_str = int(note["string"]) - string_base
                        mt_str = strings_count - ss_str
                        if not (1 <= mt_str <= 6):
                            continue
                        slot = round(voice_pos * 4 * scale)
                        if not (0 <= slot < _BEATS_PER_MEASURE):
                            slot = max(0, min(_BEATS_PER_MEASURE - 1, slot))
                        dur_slots = max(1, round(beat_qtrs * 4 * scale))
                        measure_notes.append({
                            "string": mt_str,
                            "fret": int(note["fret"]),
                            "beat": slot,
                            "duration": dur_slots,
                        })
                voice_pos += beat_qtrs

        # Deduplicate (same string + same slot): keep the lowest-fret variant
        # (avoids unrelated voices clobbering each other on the display grid).
        dedup: dict[tuple[int, int], dict] = {}
        for n in measure_notes:
            k = (n["string"], n["beat"])
            existing = dedup.get(k)
            if existing is None or n["fret"] < existing["fret"]:
                dedup[k] = n
        notes_by_measure.append(list(dedup.values()))

    sections = []
    for i in range(0, len(notes_by_measure), _MEASURES_PER_SECTION):
        chunk = notes_by_measure[i: i + _MEASURES_PER_SECTION]
        sections.append({
            "name": f"Section {len(sections) + 1}",
            "measures": [{"notes": m} for m in chunk],
        })
    if not sections:
        sections = [{"name": "Section 1", "measures": [{"notes": []}]}]
    return sections


def _track_accompaniment(track_meta: SongsterrTrack, track_json: dict) -> list[dict]:
    """Flatten a non-guitar track into absolute-time notes for the frontend
    oscillator player. Returns `[{"t": seconds, "p": midi_pitch, "d": seconds}, ...]`.

    Drums encode the GM percussion note in `fret` directly (no tuning offset).
    Bass and other pitched instruments use `tuning[string-1] + fret` like guitar.
    """
    tuning = track_json.get("tuning") or track_meta.tuning or []
    is_drums = bool(track_meta.is_drums)
    string_base = _string_base(track_json)
    capo = int(track_json.get("capo") or 0)  # frets are written relative to the capo
    measures = track_json.get("measures", [])
    measure_quarters = [_measure_quarters(m) for m in measures]

    # Walk the tempo automations to compute (measure_start_seconds, quarter_seconds)
    # for every measure. Tempo automations live on every track; values are identical
    # across tracks so this works no matter which one we read.
    automations = (track_json.get("automations") or {}).get("tempo") or []
    start_bpm = float(automations[0].get("bpm", 120)) if automations else 120.0
    tempo_at_measure: dict[int, float] = {}
    for a in automations:
        tempo_at_measure[int(a.get("measure", 0))] = float(a.get("bpm", start_bpm))

    measure_start_s: list[float] = []
    quarter_s_at_measure: list[float] = []
    cur_s = 0.0
    active_bpm = start_bpm
    for i, mq in enumerate(measure_quarters):
        if i in tempo_at_measure:
            active_bpm = tempo_at_measure[i]
        q_s = 60.0 / max(active_bpm, 20)
        measure_start_s.append(cur_s)
        quarter_s_at_measure.append(q_s)
        cur_s += mq * q_s

    notes_out: list[dict] = []
    for m_idx, measure in enumerate(measures):
        quarter_s = quarter_s_at_measure[m_idx]
        for voice in measure.get("voices", []) or []:
            voice_q = 0.0  # quarter notes within this measure
            for beat in voice.get("beats", []) or []:
                beat_q = _beat_duration_quarters(beat)
                if not beat.get("rest"):
                    for note in beat.get("notes", []) or []:
                        if note.get("rest") or "fret" not in note:
                            continue
                        if is_drums:
                            pitch = int(note["fret"])
                        else:
                            if "string" not in note:
                                continue
                            ss_str = int(note["string"]) - string_base
                            if not (0 <= ss_str < len(tuning)):
                                continue
                            pitch = int(tuning[ss_str]) + int(note["fret"]) + capo
                        if not (0 <= pitch <= 127):
                            continue
                        t = measure_start_s[m_idx] + voice_q * quarter_s
                        d = max(0.05, beat_q * quarter_s * 0.9)
                        notes_out.append({"t": round(t, 4), "p": pitch, "d": round(d, 3)})
                voice_q += beat_q
    return notes_out


def build_tab_data(
    state: SongsterrSong,
    guitar_tracks: list[tuple[SongsterrTrack, dict]],
    bpm: float,
    lyrics_sections: list[dict] | None = None,
    accompaniment_tracks: list[tuple[SongsterrTrack, dict]] | None = None,
) -> dict:
    """Build the `tab_data` dict in the same shape the ML pipeline produces.

    Guitar tracks are ordered so the user sees the most relevant one first:
    Songsterr's `popularTrackGuitar` (or `defaultTrack`) wins, then we rank
    the rest by raw note count so an empty acoustic doesn't end up on top.
    """
    lyrics_sections = lyrics_sections or []

    # Determine which track Songsterr considers the "main" guitar.
    main_part_id = state.popular_track_guitar
    if main_part_id is None and state.default_track is not None:
        # defaultTrack may point to a non-guitar; only honor it if it is.
        if any(t.part_id == state.default_track and t.is_guitar for t, _ in guitar_tracks):
            main_part_id = state.default_track

    def _note_count(td: dict) -> int:
        n = 0
        for m in td.get("measures", []):
            for v in m.get("voices", []) or []:
                for b in v.get("beats", []) or []:
                    if not b.get("rest"):
                        for nt in b.get("notes", []) or []:
                            if not nt.get("rest") and "string" in nt:
                                n += 1
        return n

    def _rank(pair: tuple[SongsterrTrack, dict]) -> tuple[int, int]:
        track, td = pair
        is_main = 0 if track.part_id == main_part_id else 1
        return (is_main, -_note_count(td))

    ordered = sorted(guitar_tracks, key=_rank)

    guitars: list[dict] = []
    for track_meta, track_json in ordered:
        sections = _build_track_sections(track_meta, track_json)
        if lyrics_sections:
            n_l = len(lyrics_sections)
            n_t = len(sections)
            for i, s in enumerate(sections):
                s["lyrics_section"] = min(int(i * n_l / n_t), n_l - 1)
        guitars.append({"name": track_meta.name or track_meta.instrument or "Guitar", "sections": sections})

    # Tuning: take from the first guitar track (they usually match).
    tuning = guitar_tracks[0][1].get("tuning") if guitar_tracks else None
    tuning_names = _tuning_to_names(tuning) if tuning else ["E", "A", "D", "G", "B", "e"]

    # Pre-compute non-guitar pitched tracks (bass/piano/…) as absolute-time
    # notes for the frontend oscillator player. Drums are skipped — the noise-
    # burst synth didn't add much musically and the user asked to drop them.
    accompaniment: list[dict] = []
    for track_meta, track_json in (accompaniment_tracks or []):
        if track_meta.is_drums:
            continue
        if track_meta.is_bass:
            kind = "bass"
        elif "piano" in (track_meta.instrument or "").lower():
            kind = "piano"
        else:
            kind = "other"
        notes = _track_accompaniment(track_meta, track_json)
        if notes:
            accompaniment.append({
                "kind": kind,
                "name": track_meta.name or track_meta.instrument or kind,
                "notes": notes,
            })

    return {
        "tuning": tuning_names,
        "bpm": round(bpm, 1),
        "lyrics_sections": lyrics_sections,
        "guitars": guitars,
        "accompaniment": accompaniment,
        "source": "songsterr",
    }


# ── MIDI builder (for FluidSynth synthesis) ─────────────────────────────────

@dataclass
class _MidiNote:
    start_tick: int
    end_tick: int
    pitch: int
    channel: int


def _track_bpm(track_json: dict, fallback: float = 120.0) -> float:
    """Extract starting BPM from a track's tempo automations."""
    autos = (track_json.get("automations") or {}).get("tempo") or []
    if autos:
        return float(autos[0].get("bpm") or fallback)
    return fallback


def build_midi_bytes(
    state: SongsterrSong,
    tracks: list[tuple[SongsterrTrack, dict]],
) -> bytes:
    """Render the Songsterr tracks into a multi-channel MIDI file (bytes).

    We render every NON-vocal track (guitars, bass, drums, etc.) so the synth
    output sounds like the song instead of a lonely guitar.
    """
    try:
        import mido
    except ImportError as e:
        raise RuntimeError("mido not installed — required for MIDI synthesis") from e

    bpm = _track_bpm(tracks[0][1]) if tracks else 120.0

    mid = mido.MidiFile(ticks_per_beat=_PPQ)

    # Tempo track
    tempo_track = mido.MidiTrack()
    tempo_track.append(mido.MetaMessage("set_tempo", tempo=mido.bpm2tempo(bpm), time=0))
    # Apply per-measure tempo changes from the first track only (Songsterr stores
    # them per-track but they're identical).
    if tracks:
        autos = (tracks[0][1].get("automations") or {}).get("tempo") or []
        # We need cumulative ticks at the start of each measure.
        # That requires walking measures, which we do per-track below; the
        # cumulative measure-tick map is identical across tracks (same song
        # structure), so compute once.
        measure_starts = _measure_start_ticks(tracks[0][1])
        cur = 0
        for a in autos[1:]:  # first one already applied as initial tempo
            m_idx = int(a.get("measure", 0))
            position = float(a.get("position", 0))  # 0..1 within the measure
            if m_idx >= len(measure_starts):
                continue
            m_len = (measure_starts[m_idx + 1] if m_idx + 1 < len(measure_starts) else measure_starts[m_idx] + 4 * _PPQ) - measure_starts[m_idx]
            tick = measure_starts[m_idx] + int(position * m_len)
            delta = max(0, tick - cur)
            tempo_track.append(mido.MetaMessage("set_tempo", tempo=mido.bpm2tempo(float(a.get("bpm", bpm))), time=delta))
            cur = tick
    mid.tracks.append(tempo_track)

    # One MIDI track per Songsterr track. Channel 9 (10 in 1-indexed) is drums.
    midi_channel = 0
    for ss_track, track_json in tracks:
        if ss_track.is_vocal or ss_track.is_empty:
            continue
        if ss_track.is_drums:
            channel = 9
        else:
            # Reserve channel 9 for GM percussion; skip it for melodic tracks.
            if midi_channel == 9:
                midi_channel = 10
            if midi_channel > 15:
                continue  # MIDI only has 16 channels — drop further tracks
            channel = midi_channel
            midi_channel += 1

        tuning = track_json.get("tuning") or ss_track.tuning
        string_base = _string_base(track_json)
        capo = int(track_json.get("capo") or 0)
        program = int(ss_track.instrument_id) if ss_track.instrument_id is not None else 24
        program = max(0, min(127, program))

        track = mido.MidiTrack()
        # Drums on channel 9 don't need program_change — GM percussion is selected
        # by channel alone. Sending program 0 doesn't hurt and keeps tracks uniform.
        track.append(mido.Message("program_change", program=program, channel=channel, time=0))

        events: list[tuple[int, str, int, int]] = []  # (tick, "on"/"off", pitch, vel)
        tick = 0
        for measure in track_json.get("measures", []):
            measure_quarters = _measure_quarters(measure)
            measure_ticks = int(measure_quarters * _PPQ)
            measure_start_tick = tick
            for voice in measure.get("voices", []) or []:
                voice_tick = measure_start_tick
                for beat in voice.get("beats", []) or []:
                    beat_ticks = int(_beat_duration_quarters(beat) * _PPQ)
                    if not beat.get("rest"):
                        for note in beat.get("notes", []) or []:
                            if note.get("rest") or "fret" not in note:
                                continue
                            if ss_track.is_drums:
                                # Songsterr stores GM percussion note numbers directly in `fret`.
                                pitch = int(note["fret"])
                            else:
                                if "string" not in note:
                                    continue
                                ss_str = int(note["string"]) - string_base
                                if not (0 <= ss_str < len(tuning)):
                                    continue
                                pitch = int(tuning[ss_str]) + int(note["fret"]) + capo
                            if 0 <= pitch <= 127:
                                velocity = 90
                                events.append((voice_tick, "on", pitch, velocity))
                                events.append((voice_tick + max(1, beat_ticks - 5), "off", pitch, 0))
                    voice_tick += beat_ticks
            tick += measure_ticks

        # Sort by tick; convert absolute → delta
        events.sort(key=lambda e: (e[0], 0 if e[1] == "off" else 1))
        prev = 0
        for ev_tick, kind, pitch, vel in events:
            delta = max(0, ev_tick - prev)
            prev = ev_tick
            msg = mido.Message(
                "note_on" if kind == "on" else "note_off",
                channel=channel, note=pitch, velocity=vel, time=delta,
            )
            track.append(msg)
        if track and len(track) > 1:
            mid.tracks.append(track)

    buf = io.BytesIO()
    mid.save(file=buf)
    return buf.getvalue()


def _measure_start_ticks(track_json: dict) -> list[int]:
    """Cumulative tick position at the start of each measure (in PPQ ticks)."""
    starts = [0]
    tick = 0
    for measure in track_json.get("measures", []):
        tick += int(_measure_quarters(measure) * _PPQ)
        starts.append(tick)
    return starts

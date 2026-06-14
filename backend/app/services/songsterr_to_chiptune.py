"""
Convert Songsterr track payloads into `chiptune_data` (the same schema the ML
chiptune pipeline produces), so songs that exist on Songsterr get exact,
human-transcribed chiptunes instead of ML guesses.

Role mapping:
  melody  (square)   — the VOCAL track when the tab has one (Songsterr encodes
                       the sung melody as notes, usually on a sax program);
                       otherwise the "main" guitar track
  harmony (sawtooth) — the densest remaining non-lead pitched track (the
                       rhythm guitar); other pitched tracks only fill measures
                       it leaves empty, up to 2 notes per slot. During
                       instrumental runs the busiest track (the solo) takes
                       the channel over.
  bass    (triangle) — the bass track, lowest note per slot
  drums   (noise)    — GM percussion notes folded into kick / snare / hihat

Timing: Songsterr songs have per-measure tempo automations (intros at half
tempo etc.), but the frontend player runs a constant-BPM 16-slots-per-measure
grid. So notes are first placed in ABSOLUTE seconds via the tempo map, then
re-quantized onto a constant grid at the song's dominant tempo — total
duration and relative timing survive tempo changes.

The player walks each track's sections sequentially, so every track is built
over the same number of measures and interior empty measures are kept.
"""

from __future__ import annotations

import logging
import math

import re

from app.services.songsterr_client import SongsterrSong, SongsterrTrack
from app.services.songsterr_to_tab import (
    _beat_duration_quarters,
    _measure_quarters,
    _string_base,
)

logger = logging.getLogger(__name__)

# 32 slots per measure (32nd-note grid) — matches the ML chiptune path so both
# sources resolve fast passages. The value is stamped into chiptune_data as
# `slots_per_measure`; older 16-grid jobs keep playing via the frontend default.
_BEATS_PER_MEASURE = 32
_MEASURES_PER_SECTION = 4

# GM percussion note → chiptune drum type. Unlisted notes are dropped.
_GM_DRUM_TYPE: dict[int, str] = {
    35: "kick", 36: "kick",
    41: "kick", 43: "kick", 45: "kick",          # low/floor toms read as kick-ish
    37: "snare", 38: "snare", 39: "snare", 40: "snare",
    47: "snare", 48: "snare", 50: "snare",        # mid/high toms
    42: "hihat", 44: "hihat", 46: "hihat",
    49: "hihat", 51: "hihat", 52: "hihat", 53: "hihat",
    55: "hihat", 57: "hihat", 59: "hihat",        # cymbals/rides as hihat
}


# ── tempo map ────────────────────────────────────────────────────────────────

def _measure_times(track_json: dict) -> tuple[list[float], list[float]]:
    """(start_seconds, quarter_seconds) per measure, from tempo automations.

    Mirrors songsterr_to_tab._track_accompaniment: automations are identical
    across tracks, values apply from their measure onward.
    """
    measures = track_json.get("measures", []) or []
    automations = (track_json.get("automations") or {}).get("tempo") or []
    start_bpm = float(automations[0].get("bpm", 120)) if automations else 120.0
    tempo_at_measure = {
        int(a.get("measure", 0)): float(a.get("bpm", start_bpm)) for a in automations
    }

    starts: list[float] = []
    quarter_s: list[float] = []
    cur_s = 0.0
    active_bpm = start_bpm
    for i, m in enumerate(measures):
        if i in tempo_at_measure:
            active_bpm = tempo_at_measure[i]
        q_s = 60.0 / max(active_bpm, 20)
        starts.append(cur_s)
        quarter_s.append(q_s)
        cur_s += _measure_quarters(m) * q_s
    starts.append(cur_s)  # end-of-song sentinel
    return starts, quarter_s


def _dominant_bpm(track_json: dict) -> float:
    """The BPM the song spends the most time at — the playback grid tempo."""
    measures = track_json.get("measures", []) or []
    starts, quarter_s = _measure_times(track_json)
    time_at_bpm: dict[float, float] = {}
    for i, m in enumerate(measures):
        bpm = round(60.0 / quarter_s[i])
        time_at_bpm[bpm] = time_at_bpm.get(bpm, 0.0) + _measure_quarters(m) * quarter_s[i]
    if not time_at_bpm:
        return 120.0
    return max(time_at_bpm, key=time_at_bpm.get)


# ── note iteration (absolute time) ───────────────────────────────────────────

def _collect_notes_abs(
    track_json: dict,
    is_drums: bool,
    starts: list[float],
    quarter_s: list[float],
) -> list[list]:
    """[t_seconds, dur_seconds, pitch] for every note in a track.

    `starts`/`quarter_s` come from the song's reference track so all tracks
    share one tempo map (some track JSONs lack their own automations).

    Tied notes are merged into the note they continue (a tie is a sustain,
    not a new attack — re-attacking them turns held vocals into beeping).
    Dead/ghost notes (percussive 'x' marks) are dropped entirely.
    """
    tuning = track_json.get("tuning") or []
    string_base = _string_base(track_json)
    capo = int(track_json.get("capo") or 0)  # frets are written relative to the capo
    out: list[list] = []
    last_idx_by_pitch: dict[int, int] = {}

    for m_idx, measure in enumerate(track_json.get("measures", []) or []):
        if m_idx >= len(quarter_s):
            break
        q_s = quarter_s[m_idx]
        for voice in measure.get("voices", []) or []:
            voice_q = 0.0  # quarter notes within the measure
            for beat in voice.get("beats", []) or []:
                beat_qtrs = _beat_duration_quarters(beat)
                if not beat.get("rest"):
                    for note in beat.get("notes", []) or []:
                        if note.get("rest") or "fret" not in note:
                            continue
                        if note.get("dead") or note.get("ghost"):
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
                        t = starts[m_idx] + voice_q * q_s
                        dur_s = beat_qtrs * q_s
                        if note.get("tie") and not is_drums:
                            j = last_idx_by_pitch.get(pitch)
                            if j is not None and t <= out[j][0] + out[j][1] + 0.06:
                                out[j][1] = (t + dur_s) - out[j][0]
                                continue
                        out.append([t, dur_s, pitch])
                        last_idx_by_pitch[pitch] = len(out) - 1
                voice_q += beat_qtrs
    return out


# ── constant-BPM grid placement ──────────────────────────────────────────────

def _tracks_to_grid(
    track_jsons: list[dict],
    slot_dur: float,
    total_slots: int,
    starts: list[float],
    quarter_s: list[float],
) -> dict[int, list[tuple[int, float]]]:
    """global_slot → [(pitch, dur_slots), ...] merged over the given tracks."""
    grid: dict[int, list[tuple[int, float]]] = {}
    for tj in track_jsons:
        for t, dur_s, pitch in _collect_notes_abs(tj, False, starts, quarter_s):
            slot = round(t / slot_dur)
            if not (0 <= slot < total_slots):
                continue
            # Cap at 3 beats (24 slots on the 32nd-note grid) — long enough for
            # tied vocal sustains to read as held, short enough that they don't
            # drone (the player decays them, but stacked 4+ second tones still
            # wash the mix out).
            dur = max(0.5, min(24.0, dur_s / slot_dur))
            grid.setdefault(slot, []).append((pitch, dur))
    return grid


def _fill_grids(
    grids: list[dict[int, list[tuple[int, float]]]],
) -> dict[int, list[tuple[int, float]]]:
    """Merge per-track grids; each later grid only fills measures all the
    earlier ones left empty. One coherent line per measure instead of a
    per-slot mash of every source (which made the channel flicker between
    tracks — chords kept getting displaced by whatever line crossed them)."""
    out: dict[int, list[tuple[int, float]]] = {}
    covered: set[int] = set()
    for grid in grids:
        added: set[int] = set()
        for slot, notes in grid.items():
            if slot // _BEATS_PER_MEASURE in covered:
                continue
            out.setdefault(slot, []).extend(notes)
            added.add(slot // _BEATS_PER_MEASURE)
        covered |= added
    return out


def _grid_with_measure_fill(
    track_jsons: list[dict],
    slot_dur: float,
    total_slots: int,
    starts: list[float],
    quarter_s: list[float],
) -> dict[int, list[tuple[int, float]]]:
    return _fill_grids([
        _tracks_to_grid([tj], slot_dur, total_slots, starts, quarter_s)
        for tj in track_jsons
    ])


def _feature_instrumental_runs(
    base: dict[int, list[tuple[int, float]]],
    grids: list[dict[int, list[tuple[int, float]]]],
    lead_flags: list[bool],
    melody_measures: set[int],
    total_measures: int,
) -> None:
    """During instrumental stretches (≥2 consecutive measures with no melody
    notes) a lead track takes the channel over — that's the guitar solo /
    intro riff, and with the rhythm track owning the channel by default it
    would never be heard. Mutates `base` in place.

    A lead-named track that's clearly playing (≥2 ONSETS per measure on
    average — onsets, because a 16th-chugging bed would always out-count a
    single-note solo line in raw notes) wins outright. In tabs without
    lead-named tracks, the busiest track by raw notes takes over only when it
    beats the bed, so a couple of stray fill notes don't hijack a quiet
    break. Measures inside the run where the featured track is silent keep
    whatever the bed had."""
    run: list[int] = []
    for m in range(total_measures + 1):
        if m < total_measures and m not in melody_measures:
            run.append(m)
            continue
        if len(run) >= 2 and grids:
            rset = set(run)
            onsets = [
                sum(1 for slot in g if slot // _BEATS_PER_MEASURE in rset)
                for g in grids
            ]
            notes_n = [
                sum(len(notes) for slot, notes in g.items()
                    if slot // _BEATS_PER_MEASURE in rset)
                for g in grids
            ]
            need = 2 * len(run)
            best = None
            lead_cands = [i for i, is_lead in enumerate(lead_flags)
                          if is_lead and onsets[i] >= need]
            if lead_cands:
                best = max(lead_cands, key=onsets.__getitem__)
            else:
                b = max(range(len(notes_n)), key=notes_n.__getitem__)
                if notes_n[b] > notes_n[0] and notes_n[b] >= need:
                    best = b
            if best is not None and best != 0:
                featured: dict[int, dict[int, list[tuple[int, float]]]] = {}
                for slot, notes in grids[best].items():
                    f_m = slot // _BEATS_PER_MEASURE
                    if f_m in rset:
                        featured.setdefault(f_m, {})[slot] = notes
                for f_m, slots in featured.items():
                    for slot in [s for s in base if s // _BEATS_PER_MEASURE == f_m]:
                        del base[slot]
                    for slot, notes in slots.items():
                        base[slot] = list(notes)
        run = []


# Harmony channel limits — keeps the mix from turning into a wall of sawtooth.
_HARMONY_MAX_VOICES = 2     # real chip music rarely block-chords more than 2 extra voices
_HARMONY_MIN_PITCH = 48     # below C3 the bass channel already covers it (mud otherwise)
_HARMONY_MIN_GAP_SLOTS = 4  # same pitch re-struck faster than an 8th note → sustain, don't re-hit (4 slots = 8th on the 32nd grid)


def _grid_to_sections(
    grid: dict[int, list[tuple[int, float]]],
    total_measures: int,
    mode: str,  # "melody" | "harmony" | "bass"
) -> list[dict]:
    """Build [{"name", "measures": [{"notes": [...]}]}] over ALL measures.

    Empty measures are kept so the player's per-track cursor stays in sync
    with the other tracks.

    Harmony is deliberately thinned: palm-muted rhythm guitars hit the same
    chord every 16th note, and rendering each hit as a sawtooth chord turns
    the mix into noise. Re-strikes of a pitch within an 8th note are merged
    into the previous note's sustain instead.
    """
    notes_by_measure: list[list[dict]] = [[] for _ in range(total_measures)]
    last_hit: dict[int, int] = {}  # harmony: pitch → slot of last emitted note
    last_note: dict[int, tuple[int, dict]] = {}  # harmony: pitch → (slot, emitted note)

    for slot in sorted(grid.keys()):
        candidates = grid[slot]
        m_idx, beat = slot // _BEATS_PER_MEASURE, slot % _BEATS_PER_MEASURE
        if mode == "melody":
            chosen = [max(candidates)]                      # highest pitch = lead line
        elif mode == "bass":
            chosen = [min(candidates)]                      # lowest pitch
        else:  # harmony: a few distinct pitches, highest first, thinned
            distinct: dict[int, float] = {}
            for pitch, dur in sorted(candidates, reverse=True):
                if pitch < _HARMONY_MIN_PITCH or pitch in distinct:
                    continue
                prev = last_hit.get(pitch)
                if prev is not None and slot - prev < _HARMONY_MIN_GAP_SLOTS:
                    # A re-strike, not a new attack — sustain the already
                    # emitted note through this strum's ring time so the
                    # guitar doesn't go silent mid-pattern.
                    emitted = last_note.get(pitch)
                    if emitted is not None:
                        e_slot, e_note = emitted
                        e_note["dur"] = round(min(24.0, max(e_note["dur"], slot + dur - e_slot)), 2)
                    continue
                distinct[pitch] = max(dur, float(_HARMONY_MIN_GAP_SLOTS))
                if len(distinct) >= _HARMONY_MAX_VOICES:
                    break
            # On emission, register EVERY pitch of the chord as struck —
            # including voices the 2-voice cap dropped — so a re-struck chord
            # can't smuggle its dropped third voice back in on the next 16th.
            # Pure re-strike slots don't refresh the timer, so steady chugs
            # still pulse at 8th-note rate instead of dying after one hit.
            if distinct:
                for pitch, _ in candidates:
                    if pitch >= _HARMONY_MIN_PITCH:
                        last_hit[pitch] = slot
            chosen = list(distinct.items())

        for pitch, dur in chosen:
            note = {
                "pitch": pitch,
                "beat": beat,
                "dur": round(dur, 2),
            }
            notes_by_measure[m_idx].append(note)
            if mode == "harmony":
                last_note[pitch] = (slot, note)

    sections = []
    for i in range(0, total_measures, _MEASURES_PER_SECTION):
        chunk = notes_by_measure[i: i + _MEASURES_PER_SECTION]
        sections.append({
            "name": f"Section {len(sections) + 1}",
            "measures": [{"notes": m} for m in chunk],
        })
    if not sections:
        sections = [{"name": "Section 1", "measures": [{"notes": []}]}]
    return sections


def _drums_to_patterns(
    track_json: dict,
    slot_dur: float,
    total_slots: int,
    starts: list[float],
    quarter_s: list[float],
) -> list[dict]:
    """[{"measure", "beat", "type"}, ...] deduped per (slot, type)."""
    seen: set[tuple[int, str]] = set()
    patterns: list[dict] = []
    for t, _dur, gm_note in _collect_notes_abs(track_json, True, starts, quarter_s):
        drum_type = _GM_DRUM_TYPE.get(gm_note)
        if drum_type is None:
            continue
        slot = round(t / slot_dur)
        if not (0 <= slot < total_slots) or (slot, drum_type) in seen:
            continue
        seen.add((slot, drum_type))
        patterns.append({
            "measure": slot // _BEATS_PER_MEASURE,
            "beat": slot % _BEATS_PER_MEASURE,
            "type": drum_type,
        })
    patterns.sort(key=lambda p: (p["measure"], p["beat"]))
    return patterns


# "Backing Vocals", "Harmony Vocals", gang/choir parts — never the lead line.
_BACKING_RE = re.compile(r"backing|backup|harmon|choir|chorus|gang", re.IGNORECASE)

# Lead/solo guitars can't be the harmony bed — they'd replace the rhythm part
# everywhere; instead they own the dedicated lead channel (see _pick_lead).
_LEAD_RE = re.compile(r"lead|solo", re.IGNORECASE)

# Keyboard-family tracks — second choice for the lead channel when there's no
# lead/solo guitar (piano ballads etc.).
_KEYS_RE = re.compile(r"piano|keys|keyboard|organ|rhodes|wurli|synth|grand", re.IGNORECASE)


def _is_backing_vocal(track: SongsterrTrack) -> bool:
    return bool(_BACKING_RE.search(f"{track.name} {track.instrument}"))


def _is_lead_guitar(track: SongsterrTrack) -> bool:
    return bool(_LEAD_RE.search(f"{track.name} {track.instrument}"))


def _is_keys(track: SongsterrTrack) -> bool:
    return bool(_KEYS_RE.search(f"{track.name} {track.instrument}"))


# A counter-melody candidate must have at least this many notes (so we don't put
# stray fills on the channel) and stay under this fraction of the rhythm bed's
# note count (so a SECOND rhythm guitar — roughly as dense as the bed — is never
# mistaken for a lead line and doesn't just thicken the rhythm).
_LEAD_MIN_NOTES = 15
_LEAD_MAX_BED_FRAC = 0.7


def _pick_lead(
    pitched: list[tuple[SongsterrTrack, dict]],
    melody_track: SongsterrTrack,
    bed_track: SongsterrTrack | None,
) -> tuple[SongsterrTrack, dict] | None:
    """Choose the source for the dedicated lead/counter-melody channel.

    Priority: a lead/solo-named guitar (the actual solo line), then a keyboard
    track (piano), then — for songs whose solo isn't explicitly named "lead" —
    the densest clearly-secondary guitar (lighter than the rhythm bed). Never
    the melody, the harmony bed, or a co-equal rhythm guitar. Returns None when
    there's no good candidate."""
    cands = [
        (t, d) for (t, d) in pitched
        if t is not melody_track and t is not bed_track and _note_count(d) > 0
    ]
    leads = [(t, d) for (t, d) in cands if _is_lead_guitar(t)]
    if leads:
        return max(leads, key=lambda p: _note_count(p[1]))
    keys = [(t, d) for (t, d) in cands if _is_keys(t)]
    if keys:
        return max(keys, key=lambda p: _note_count(p[1]))
    # Counter-melody fallback: a secondary guitar carrying the solo/lead lines.
    bed_notes = next((_note_count(d) for (t, d) in pitched if t is bed_track), 0)
    secondary = [
        (t, d) for (t, d) in cands
        if _note_count(d) >= _LEAD_MIN_NOTES
        and (bed_notes == 0 or _note_count(d) <= _LEAD_MAX_BED_FRAC * bed_notes)
    ]
    if secondary:
        return max(secondary, key=lambda p: _note_count(p[1]))
    return None


def _note_count(track_json: dict) -> int:
    n = 0
    for m in track_json.get("measures", []) or []:
        for v in m.get("voices", []) or []:
            for b in v.get("beats", []) or []:
                if not b.get("rest"):
                    for nt in b.get("notes", []) or []:
                        if not nt.get("rest") and "fret" in nt:
                            n += 1
    return n


def build_chiptune_data(
    state: SongsterrSong,
    tracks: list[tuple[SongsterrTrack, dict]],
) -> dict | None:
    """Assemble chiptune_data from Songsterr tracks (vocal tracks included!).
    Returns None when there is no usable melody source."""
    usable = [(t, d) for (t, d) in tracks if not t.is_empty and _note_count(d) > 0]
    if not usable:
        return None

    drums = next(((t, d) for (t, d) in usable if t.is_drums), None)
    bass = next(((t, d) for (t, d) in usable if t.is_bass), None)
    vocals = [(t, d) for (t, d) in usable if t.is_vocal]
    pitched = [(t, d) for (t, d) in usable if not t.is_drums and not t.is_vocal and not t.is_bass]

    # Melody: the main vocal track when the tab has one — that's the line
    # people recognize a song by. Otherwise Songsterr's main guitar.
    # Lead vocals win over backing vocals even with fewer notes (backing
    # tracks are often denser but carry harmonies, not the tune); note count
    # only breaks ties within the same class.
    melody_fill_jsons: list[dict] = []
    if vocals:
        leads = [p for p in vocals if not _is_backing_vocal(p[0])]
        pool = leads or vocals
        melody_pair = max(pool, key=lambda pair: _note_count(pair[1]))
        melody_fill_jsons = [d for (t, d) in vocals if t is not melody_pair[0]]
    else:
        main_part_id = state.popular_track_guitar
        if main_part_id is None:
            main_part_id = state.default_track
        melody_pair = next(
            ((t, d) for (t, d) in pitched if t.part_id == main_part_id),
            None,
        ) or (max(pitched, key=lambda pair: _note_count(pair[1])) if pitched else None)
    if melody_pair is None:
        return None

    # Harmony: the densest remaining non-lead pitched track (in practice the
    # rhythm guitar — the part that actually drives the song); the others
    # (2nd guitar, piano, the clean intro guitar, …) only fill measures it
    # leaves empty, so quiet sections still aren't silent. Lead/solo tracks
    # sort last so they can't become the bed, but they take the channel over
    # during instrumental runs (see _feature_instrumental_runs).
    harmony_pairs = [(t, d) for (t, d) in pitched if t is not melody_pair[0]]
    harmony_pairs.sort(key=lambda p: (_is_lead_guitar(p[0]), -_note_count(p[1])))

    # Dedicated lead/counter-melody channel: the solo guitar (or piano) plays on
    # its own voice, including under the vocals where the single harmony channel
    # can't carry it. Exclude it from the harmony fill so it isn't doubled.
    bed_track = harmony_pairs[0][0] if harmony_pairs else None
    lead_pair = _pick_lead(pitched, melody_pair[0], bed_track)
    if lead_pair is not None:
        harmony_pairs = [p for p in harmony_pairs if p[0] is not lead_pair[0]]
    harmony_jsons = [d for _, d in harmony_pairs]

    # Timing reference: the track with the most measures AND tempo automations
    # (maps are usually identical, but some track JSONs omit them).
    candidates_ref = [d for _, d in usable if (d.get("automations") or {}).get("tempo")]
    ref_json = max(
        candidates_ref or (d for _, d in usable),
        key=lambda d: len(d.get("measures") or []),
    )
    bpm = _dominant_bpm(ref_json)
    slot_dur = (60.0 / bpm) / 8.0  # 32 slots per 4-quarter measure (32nd notes)
    starts, quarter_s = _measure_times(ref_json)
    total_s = starts[-1]
    total_measures = max(1, math.ceil(total_s / (slot_dur * _BEATS_PER_MEASURE)))
    total_slots = total_measures * _BEATS_PER_MEASURE

    # Melody is the voice ONLY. Where the vocal transcription has holes
    # (instrumental breaks or a lazy transcriber), the channel stays silent —
    # harmony and bass already carry those sections, and having the lead
    # square voice switch to guitar riffs and back is disorienting (tried in
    # 2.3.0, reverted on user feedback). Holes in the LEAD track are filled
    # measure-by-measure from the other vocal tracks though (backing vocals
    # carry the hook in choruses the transcriber only wrote once) — still
    # voice, and the lead always wins where both have notes.
    melody_grid = _grid_with_measure_fill(
        [melody_pair[1], *melody_fill_jsons], slot_dur, total_slots, starts, quarter_s)
    melody_sections = _grid_to_sections(melody_grid, total_measures, "melody")
    harmony_grids = [
        _tracks_to_grid([d], slot_dur, total_slots, starts, quarter_s)
        for d in harmony_jsons
    ]
    harmony_grid = _fill_grids(harmony_grids)
    melody_measures = {slot // _BEATS_PER_MEASURE for slot in melody_grid}

    # Lead channel — a single top line from the solo/piano track, over ALL
    # measures (it's its own voice now, not a fill). When we have one, the
    # harmony stays a pure rhythm bed; otherwise fall back to the old behaviour
    # of surfacing the solo inside the harmony during instrumental runs.
    lead_sections = None
    if lead_pair is not None:
        lead_grid = _tracks_to_grid([lead_pair[1]], slot_dur, total_slots, starts, quarter_s)
        lead_sections = _grid_to_sections(lead_grid, total_measures, "melody")
    else:
        lead_flags = [_is_lead_guitar(t) for t, _ in harmony_pairs]
        _feature_instrumental_runs(harmony_grid, harmony_grids, lead_flags, melody_measures, total_measures)
    harmony_sections = _grid_to_sections(harmony_grid, total_measures, "harmony")
    bass_sections = _grid_to_sections(
        _tracks_to_grid([bass[1]] if bass else [], slot_dur, total_slots, starts, quarter_s),
        total_measures, "bass")
    drum_patterns = _drums_to_patterns(drums[1], slot_dur, total_slots, starts, quarter_s) if drums else []

    logger.info(
        "Songsterr chiptune: melody=%s harmony=%d tracks lead=%s bass=%s drums=%s (%.0fs, %d measures @ %.0f BPM)",
        melody_pair[0].name,
        len(harmony_jsons),
        lead_pair[0].name if lead_pair else "—",
        bass[0].name if bass else "—",
        drums[0].name if drums else "—",
        total_s, total_measures, bpm,
    )

    tracks_out = {
        "melody":  {"waveform": "square",   "sections": melody_sections},
        "harmony": {"waveform": "sawtooth", "sections": harmony_sections},
        "bass":    {"waveform": "triangle", "sections": bass_sections},
        "drums":   {"waveform": "noise",    "patterns": drum_patterns},
    }
    if lead_sections is not None:
        tracks_out["lead"] = {"waveform": "pulse", "sections": lead_sections}

    return {
        "bpm": round(bpm, 1),
        "source": "songsterr",
        "slots_per_measure": _BEATS_PER_MEASURE,
        "tracks": tracks_out,
    }

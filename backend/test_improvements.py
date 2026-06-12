"""Quick functional checks for the v2 chiptune / v5 tab pipeline changes.

Run inside the backend image:
  docker run --rm -v .:/app -w /app --entrypoint python compose-maketabs-backend test_improvements.py
"""

import numpy as np

failures = []


def check(name, cond, detail=""):
    status = "ok" if cond else "FAIL"
    print(f"[{status}] {name} {detail}")
    if not cond:
        failures.append(name)


# ── BeatGrid ─────────────────────────────────────────────────────────────────
from app.services.beat_grid import BeatGrid

# Drifting tempo: beats slow down from 0.50s to 0.55s intervals.
intervals = np.linspace(0.50, 0.55, 400)
beat_times = np.concatenate([[0.0], np.cumsum(intervals)])
grid = BeatGrid(beat_times, duration_s=float(beat_times[-1]))

# An onset exactly on beat 300 must land on slot (300*4) regardless of drift.
m, s = grid.slot(float(beat_times[300]))
check("BeatGrid drift-proof slot", (m, s) == (300 * 4 // 16, (300 * 4) % 16), f"got {(m, s)}")

# The old constant-BPM grid would misplace this onset badly.
const_measure = int(beat_times[300] / (4 * 60.0 / grid.bpm))
check("BeatGrid beats old grid", const_measure != 300 * 4 // 16,
      f"old-grid measure {const_measure} vs true {300 * 4 // 16}")

# Midpoint between two beats → odd slot.
mid = (beat_times[10] + beat_times[11]) / 2
m, s = grid.slot(float(mid))
check("BeatGrid subdivision", (m * 16 + s) == 10 * 4 + 2, f"got global slot {m * 16 + s}")

# Duration in slots is tempo-relative.
d = grid.duration_slots(float(beat_times[20]), float(beat_times[22]))
check("BeatGrid duration", abs(d - 8.0) < 0.01, f"got {d:.3f}")


# ── Viterbi fingering ────────────────────────────────────────────────────────
from app.services.audio_pipeline import _assign_positions, _candidates

# A run up the D major scale around 7th position. Greedy would bounce to fret 0
# wherever an open-string pitch appears; Viterbi should stay in position.
pitches = [62, 64, 66, 67, 69, 71, 73, 74, 73, 71, 69, 67, 66, 64, 62]
pos = _assign_positions(pitches)
check("Viterbi returns all", len(pos) == len(pitches))
check("Viterbi valid candidates", all(p in _candidates(pt) for p, pt in zip(pos, pitches)))
fretted = [f for (_, f) in pos if f > 0]
max_jump = max(abs(a - b) for a, b in zip(fretted, fretted[1:]))
check("Viterbi hand stays put", max_jump <= 3, f"max fret jump {max_jump}")

# Same pitch repeated → same position.
pos2 = _assign_positions([64, 64, 64])
check("Viterbi stable on repeats", len(set(pos2)) == 1, f"got {pos2}")


# ── Songsterr → chiptune ─────────────────────────────────────────────────────
from app.services.songsterr_client import SongsterrSong, SongsterrTrack
from app.services.songsterr_to_chiptune import build_chiptune_data

STD_TUNING = [64, 59, 55, 50, 45, 40]  # Songsterr high→low


def _track(part_id, name, **flags):
    return SongsterrTrack(
        part_id=part_id, hash="", instrument=name, instrument_id=27, name=name,
        tuning=STD_TUNING,
        is_guitar=flags.get("guitar", False), is_bass=flags.get("bass", False),
        is_drums=flags.get("drums", False), is_vocal=flags.get("vocal", False),
        is_empty=False,
    )


def _measure(beats):
    return {"signature": [4, 4], "voices": [{"beats": beats}]}


def _note_beat(string, fret, dur=(1, 4)):
    return {"duration": list(dur), "notes": [{"string": string, "fret": fret}]}


# Guitar: a chord (3 notes) on beat 1 of measure 0, then rests.
# Strings are 0-indexed (string 0 = high e) like the live Songsterr CDN data.
rest = {"duration": [1, 4], "rest": True}
guitar_json = {
    "strings": 6, "tuning": STD_TUNING,
    "automations": {"tempo": [{"measure": 0, "bpm": 140}]},
    "measures": [
        _measure([
            {"duration": [1, 4], "notes": [
                {"string": 0, "fret": 0}, {"string": 1, "fret": 0}, {"string": 2, "fret": 1},
            ]},
            rest, rest, rest,
        ]),
        _measure([rest, rest, rest, rest]),          # empty interior measure
        _measure([_note_beat(0, 5), rest, rest, rest]),
    ],
}
bass_json = {
    "strings": 4, "tuning": [43, 38, 33, 28],
    "measures": [
        _measure([_note_beat(3, 0), rest, rest, rest]),
        _measure([rest, rest, rest, rest]),
        _measure([rest, rest, rest, rest]),
    ],
}
# Drums: kick (36) + hihat (42) on the SAME beat — both must survive.
drums_json = {
    "measures": [
        _measure([
            {"duration": [1, 4], "notes": [{"string": 1, "fret": 36}, {"string": 2, "fret": 42}]},
            rest, rest, rest,
        ]),
        _measure([rest, rest, rest, rest]),
        _measure([rest, rest, rest, rest]),
    ],
}

g_track = _track(1, "Guitar", guitar=True)
b_track = _track(2, "Bass", bass=True)
d_track = _track(3, "Drums", drums=True)
song = SongsterrSong(
    song_id=1, revision_id=1, image="x", artist="A", title="T",
    tracks=[g_track, b_track, d_track], popular_track_guitar=1,
)

data = build_chiptune_data(song, [(g_track, guitar_json), (b_track, bass_json), (d_track, drums_json)])
check("Songsterr chiptune built", data is not None)
check("Songsterr chiptune bpm", data["bpm"] == 140.0)
check("Songsterr chiptune source", data["source"] == "songsterr")
check("Songsterr chiptune waveforms",
      [data["tracks"][k]["waveform"] for k in ("melody", "harmony", "bass", "drums")]
      == ["square", "sawtooth", "triangle", "noise"])

mel = data["tracks"]["melody"]["sections"]
all_measures = [m for sec in mel for m in sec["measures"]]
check("Songsterr melody keeps empty measures", len(all_measures) == 3,
      f"got {len(all_measures)}")
m0 = all_measures[0]["notes"]
check("Songsterr melody = highest chord note", len(m0) == 1 and m0[0]["pitch"] == 64,
      f"got {m0}")
m2 = all_measures[2]["notes"]
check("Songsterr melody pitch from tuning", m2 and m2[0]["pitch"] == 64 + 5, f"got {m2}")

bass_notes = [n for sec in data["tracks"]["bass"]["sections"] for m in sec["measures"] for n in m["notes"]]
# string 3 (0-indexed) of [43,38,33,28] (high→low) = tuning[3] = 28
check("Songsterr bass note", len(bass_notes) == 1 and bass_notes[0]["pitch"] == 28, f"got {bass_notes}")

drum_pats = data["tracks"]["drums"]["patterns"]
types_at_0 = sorted(p["type"] for p in drum_pats if (p["measure"], p["beat"]) == (0, 0))
check("Kick + hihat coexist on one beat", types_at_0 == ["hihat", "kick"], f"got {drum_pats}")

# Tempo changes: measure 0 @ 60 BPM (4s), measures 1-3 @ 120 BPM (2s each).
# Dominant tempo = 120 → a note WRITTEN in measure 1 must land in grid
# measure 2 (its absolute time is 4s = two 2-second measures in).
tempo_json = {
    "strings": 6, "tuning": STD_TUNING,
    "automations": {"tempo": [
        {"measure": 0, "bpm": 60}, {"measure": 1, "bpm": 120},
    ]},
    "measures": [
        _measure([_note_beat(1, 0), rest, rest, rest]),
        _measure([_note_beat(1, 2), rest, rest, rest]),
        _measure([rest, rest, rest, rest]),
        _measure([rest, rest, rest, rest]),
    ],
}
t_track = _track(1, "Guitar", guitar=True)
t_song = SongsterrSong(song_id=2, revision_id=1, image="x", artist="A", title="T",
                       tracks=[t_track], popular_track_guitar=1)
t_data = build_chiptune_data(t_song, [(t_track, tempo_json)])
check("Dominant tempo wins", t_data["bpm"] == 120.0, f"got {t_data['bpm']}")
t_notes = [(mi, n) for sec in t_data["tracks"]["melody"]["sections"]
           for mi_local, m in enumerate(sec["measures"])
           for n in m["notes"]
           for mi in [t_data["tracks"]["melody"]["sections"].index(sec) * 4 + mi_local]]
placements = sorted((mi, n["beat"]) for mi, n in t_notes)
check("Tempo-map re-quantization", placements == [(0, 0), (2, 0)], f"got {placements}")

# Vocal track present → it becomes the melody, guitar moves to harmony.
v_track = _track(7, "Vocals", vocal=True)
vocals_json = {
    "strings": 6, "tuning": STD_TUNING,
    "measures": [
        _measure([_note_beat(0, 7), rest, rest, rest]),  # distinctive pitch 71
        _measure([rest, rest, rest, rest]),
        _measure([rest, rest, rest, rest]),
    ],
}
v_data = build_chiptune_data(
    song, [(g_track, guitar_json), (v_track, vocals_json), (b_track, bass_json)])
v_mel = [n["pitch"] for sec in v_data["tracks"]["melody"]["sections"]
         for m in sec["measures"] for n in m["notes"]]
v_harm = [n["pitch"] for sec in v_data["tracks"]["harmony"]["sections"]
          for m in sec["measures"] for n in m["notes"]]
check("Vocal track becomes melody", v_mel == [71], f"got {v_mel}")
check("Guitar moves to harmony", 64 in v_harm and 69 in v_harm, f"got {v_harm}")


# Ties sustain instead of re-attacking; ghost notes are dropped.
tie_json = {
    "strings": 6, "tuning": STD_TUNING,
    "automations": {"tempo": [{"measure": 0, "bpm": 120}]},
    "measures": [
        _measure([
            {"duration": [1, 4], "notes": [{"string": 1, "fret": 5}]},
            {"duration": [1, 4], "notes": [{"string": 1, "fret": 5, "tie": True}]},
            {"duration": [1, 4], "notes": [{"string": 2, "fret": 0, "ghost": True}]},
            rest,
        ]),
    ],
}
tie_track = _track(1, "Vocals", vocal=True)
tie_song = SongsterrSong(song_id=3, revision_id=1, image="x", artist="A", title="T",
                         tracks=[tie_track], popular_track_guitar=None)
tie_data = build_chiptune_data(tie_song, [(tie_track, tie_json)])
tie_notes = [n for sec in tie_data["tracks"]["melody"]["sections"]
             for m in sec["measures"] for n in m["notes"]]
check("Tie merged into one sustained note",
      len(tie_notes) == 1 and tie_notes[0]["dur"] == 8.0, f"got {tie_notes}")

# Vocal melody gaps stay SILENT (no guitar fill — reverted in 2.3.2 on user
# feedback: the lead voice switching to guitar riffs was disorienting).
fill_vocal_json = {
    "strings": 6, "tuning": STD_TUNING,
    "automations": {"tempo": [{"measure": 0, "bpm": 120}]},
    "measures": [_measure([_note_beat(0, 3), rest, rest, rest])]
                + [_measure([rest, rest, rest, rest])] * 6
                + [_measure([_note_beat(0, 3), rest, rest, rest])],
}
fill_guitar_json = {
    "strings": 6, "tuning": STD_TUNING,
    "measures": [_measure([_note_beat(0, 10), rest, rest, rest])] * 8,
}
fv = _track(7, "Vocals", vocal=True)
fg = _track(1, "Lead", guitar=True)
f_song = SongsterrSong(song_id=4, revision_id=1, image="x", artist="A", title="T",
                       tracks=[fv, fg], popular_track_guitar=1)
f_data = build_chiptune_data(f_song, [(fv, fill_vocal_json), (fg, fill_guitar_json)])
by_measure = {}
for si, sec in enumerate(f_data["tracks"]["melody"]["sections"]):
    for mi, m in enumerate(sec["measures"]):
        for n in m["notes"]:
            by_measure.setdefault(si * 4 + mi, []).append(n["pitch"])
check("Vocal measures keep vocal melody",
      by_measure.get(0) == [67] and by_measure.get(7) == [67], f"got {by_measure}")
check("Melody gaps stay silent (no guitar fill)",
      set(by_measure) == {0, 7}, f"got {by_measure}")


# Legacy 1-indexed strings: a track that reaches string == len(tuning) is
# 1-based — string 6 of standard tuning is low E (40), not out of range.
legacy_guitar_json = {
    "strings": 6, "tuning": STD_TUNING,
    "automations": {"tempo": [{"measure": 0, "bpm": 120}]},
    "measures": [_measure([_note_beat(6, 0), rest, rest, rest])],
}
lg_track = _track(1, "Guitar", guitar=True)
lg_song = SongsterrSong(song_id=5, revision_id=1, image="x", artist="A", title="T",
                        tracks=[lg_track], popular_track_guitar=1)
lg_data = build_chiptune_data(lg_song, [(lg_track, legacy_guitar_json)])
lg_notes = [n for sec in lg_data["tracks"]["melody"]["sections"]
            for m in sec["measures"] for n in m["notes"]]
check("Legacy 1-indexed strings detected", len(lg_notes) == 1 and lg_notes[0]["pitch"] == 40,
      f"got {lg_notes}")

# Lead vocals beat denser backing vocals; backing fills lead's empty measures
# (still voice-only) but never overrides measures where the lead sings.
lead_json = {
    "strings": 6, "tuning": STD_TUNING,
    "automations": {"tempo": [{"measure": 0, "bpm": 120}]},
    "measures": [_measure([_note_beat(0, 7), rest, rest, rest]),   # 71
                 _measure([rest, rest, rest, rest]),
                 _measure([rest, rest, rest, rest])],
}
backing_json = {
    "strings": 6, "tuning": STD_TUNING,
    "measures": [_measure([_note_beat(0, 2), _note_beat(0, 2), rest, rest]),  # denser, 66
                 _measure([_note_beat(0, 2), rest, rest, rest]),               # fills gap
                 _measure([rest, rest, rest, rest])],
}
lv = _track(7, "Lead Vocals", vocal=True)
bv = _track(8, "Backing Vocals", vocal=True)
lb2_song = SongsterrSong(song_id=6, revision_id=1, image="x", artist="A", title="T",
                         tracks=[lv, bv], popular_track_guitar=None)
lb2_data = build_chiptune_data(lb2_song, [(lv, lead_json), (bv, backing_json)])
lb2_by_measure = {}
for si, sec in enumerate(lb2_data["tracks"]["melody"]["sections"]):
    for mi, m in enumerate(sec["measures"]):
        for n in m["notes"]:
            lb2_by_measure.setdefault(si * 4 + mi, []).append(n["pitch"])
check("Lead vocals win over denser backing", lb2_by_measure.get(0) == [71],
      f"got {lb2_by_measure}")
check("Backing vocals fill lead gaps only", lb2_by_measure.get(1) == [66]
      and set(lb2_by_measure) == {0, 1}, f"got {lb2_by_measure}")


# Harmony thinning: max 2 voices, no re-strikes within an 8th, no sub-C3 mud.
from app.services.songsterr_to_chiptune import _grid_to_sections
thin_grid = {
    0: [(60, 1.0), (64, 1.0), (67, 1.0)],   # full triad → keep top 2 only
    1: [(60, 1.0), (64, 1.0), (67, 1.0)],   # same chord next 16th → re-strike, dropped
    4: [(40, 1.0)],                          # below C3 → dropped (bass channel territory)
    8: [(64, 1.0)],                          # far enough from slot 1 → kept
}
thin = _grid_to_sections(thin_grid, 1, "harmony")
got = sorted((n["beat"], n["pitch"]) for n in thin[0]["measures"][0]["notes"])
check("Harmony thinned to 2 voices, no chugs, no mud",
      got == [(0, 64), (0, 67), (8, 64)], f"got {got}")

# A dropped re-strike sustains the already-emitted note through its ring time
# (a short strum then a long ring on the next 16th must not go silent).
ring = _grid_to_sections({0: [(64, 1.0)], 1: [(64, 6.0)]}, 1, "harmony")
ring_notes = ring[0]["measures"][0]["notes"]
check("Re-strike extends sustain instead of silence",
      len(ring_notes) == 1 and ring_notes[0]["dur"] == 7.0, f"got {ring_notes}")

# Harmony channel follows the densest track; a sparse lead crossing the same
# measures no longer displaces the rhythm chords, but still fills measures
# the rhythm track leaves empty.
rhythm_json = {
    "strings": 6, "tuning": STD_TUNING,
    "automations": {"tempo": [{"measure": 0, "bpm": 120}]},
    "measures": [_measure([_note_beat(1, 0), _note_beat(1, 0), _note_beat(1, 0), _note_beat(1, 0)])] * 2
                + [_measure([rest, rest, rest, rest])],
}
sparse_lead_json = {
    "strings": 6, "tuning": STD_TUNING,
    "measures": [_measure([_note_beat(0, 12), rest, rest, rest]),       # crosses rhythm (76)
                 _measure([rest, rest, rest, rest]),
                 _measure([_note_beat(0, 12), rest, rest, rest])],      # fills empty measure
}
hv = _track(7, "Lead Vocals", vocal=True)
hv_json = {
    "strings": 6, "tuning": STD_TUNING,
    "measures": [_measure([_note_beat(0, 7), rest, rest, rest])] + [_measure([rest] * 4)] * 2,
}
hr = _track(1, "Rhythm Guitar", guitar=True)
hl = _track(2, "Lead Guitar", guitar=True)
h_song = SongsterrSong(song_id=7, revision_id=1, image="x", artist="A", title="T",
                       tracks=[hv, hr, hl], popular_track_guitar=1)
h_data = build_chiptune_data(h_song, [(hv, hv_json), (hr, rhythm_json), (hl, sparse_lead_json)])
h_by_measure = {}
for si, sec in enumerate(h_data["tracks"]["harmony"]["sections"]):
    for mi, m in enumerate(sec["measures"]):
        for n in m["notes"]:
            h_by_measure.setdefault(si * 4 + mi, set()).add(n["pitch"])
check("Harmony keeps rhythm track despite crossing lead",
      h_by_measure.get(0) == {59} and h_by_measure.get(1) == {59}, f"got {h_by_measure}")
check("Harmony fills empty measures from other tracks",
      h_by_measure.get(2) == {76}, f"got {h_by_measure}")

# Capo shifts every pitch up (frets are written relative to the capo).
capo_json = {
    "strings": 6, "tuning": STD_TUNING, "capo": 3,
    "automations": {"tempo": [{"measure": 0, "bpm": 120}]},
    "measures": [_measure([_note_beat(0, 2), rest, rest, rest])],
}
c_track = _track(1, "Guitar", guitar=True)
c_song = SongsterrSong(song_id=8, revision_id=1, image="x", artist="A", title="T",
                       tracks=[c_track], popular_track_guitar=1)
c_data = build_chiptune_data(c_song, [(c_track, capo_json)])
c_notes = [n for sec in c_data["tracks"]["melody"]["sections"]
           for m in sec["measures"] for n in m["notes"]]
check("Capo honored in pitch", len(c_notes) == 1 and c_notes[0]["pitch"] == 64 + 2 + 3,
      f"got {c_notes}")


# ── ML tab sections: empty chunks kept, grid placement ───────────────────────
from app.services.audio_pipeline import _build_sections

const_grid = BeatGrid(np.arange(0.0, 120.0, 0.5), duration_s=120.0)  # 120 BPM, 60 measures
# notes: [start, end, pitch, velocity]; one note at t=0, one much later (measure 30)
events = np.array([
    [0.0, 0.5, 64, 0.8, 0],
    [60.0, 60.5, 67, 0.8, 0],
], dtype=object)
sections = _build_sections(events, const_grid)
total_m = sum(len(s["measures"]) for s in sections)
check("Tab sections cover full song", total_m == const_grid.total_measures, f"got {total_m}")
# note 2 at t=60s → beat 120 → measure 30
notes_m30 = sections[30 // 4]["measures"][30 % 4]["notes"]
check("Tab note lands in measure 30", len(notes_m30) == 1, f"got {notes_m30}")


print()
if failures:
    print(f"{len(failures)} FAILURES: {failures}")
    raise SystemExit(1)
print("ALL CHECKS PASSED")

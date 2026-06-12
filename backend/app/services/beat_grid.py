"""
Beat-aligned quantization grid shared by the tab and chiptune ML pipelines.

The old approach divided absolute time by a constant measure duration derived
from a single global BPM estimate. Real recordings drift, so a 1% tempo error
accumulates to several beats over a full song and notes land in the wrong
measures. Instead we detect the actual beat times once (on the full mix, where
drums make tracking reliable) and snap every onset to the nearest subdivision
of the nearest real beat.

Frontends still play back on a constant-BPM grid; `bpm` here is derived from
the median beat interval so grid and playback agree.
"""

import logging

import numpy as np

logger = logging.getLogger(__name__)

_BEATS_PER_MEASURE_QUARTERS = 4   # 4/4 assumed
_SLOTS_PER_QUARTER = 4            # 16 display slots per measure
_SLOTS_PER_MEASURE = _BEATS_PER_MEASURE_QUARTERS * _SLOTS_PER_QUARTER


class BeatGrid:
    """Maps absolute times to (measure, slot) using detected beat positions."""

    def __init__(self, beat_times: np.ndarray, duration_s: float):
        self.beat_times = np.asarray(beat_times, dtype=float)
        intervals = np.diff(self.beat_times)
        # Median interval is robust against the tracker skipping/adding a beat.
        self._interval = float(np.median(intervals)) if len(intervals) > 0 else 0.5
        if self._interval <= 0:
            self._interval = 0.5
        self.bpm = 60.0 / self._interval
        self.duration_s = duration_s
        self.total_measures = max(
            1, int(self._fractional_beat(duration_s) / _BEATS_PER_MEASURE_QUARTERS) + 1
        )

    def _fractional_beat(self, t: float) -> float:
        """Continuous beat index at time t; beat 0 = first detected beat."""
        beats = self.beat_times
        if len(beats) == 0:
            return t / self._interval
        if t <= beats[0]:
            return (t - beats[0]) / self._interval
        if t >= beats[-1]:
            return (len(beats) - 1) + (t - beats[-1]) / self._interval
        i = int(np.searchsorted(beats, t, side="right")) - 1
        gap = beats[i + 1] - beats[i]
        if gap <= 0:
            return float(i)
        return i + (t - beats[i]) / gap

    def slot(self, t: float) -> tuple[int, int]:
        """(measure_idx, slot_in_measure) for an onset time, clamped to range."""
        global_slot = int(round(self._fractional_beat(t) * _SLOTS_PER_QUARTER))
        global_slot = max(0, min(global_slot, self.total_measures * _SLOTS_PER_MEASURE - 1))
        return global_slot // _SLOTS_PER_MEASURE, global_slot % _SLOTS_PER_MEASURE

    def duration_slots(self, start_s: float, end_s: float) -> float:
        """Note length in slot units, beat-relative (tempo drift cancelled)."""
        return (self._fractional_beat(end_s) - self._fractional_beat(start_s)) * _SLOTS_PER_QUARTER


def build_beat_grid(audio_path: str, duration_ms: int) -> BeatGrid:
    """Track beats on the full mix and return a BeatGrid.

    Falls back to a constant grid from the median frame tempo when the tracker
    finds too few beats (e.g. ambient tracks with no percussion).
    """
    import librosa

    duration_s = duration_ms / 1000
    y, sr = librosa.load(audio_path, sr=22050, mono=True)

    _, beat_times = librosa.beat.beat_track(y=y, sr=sr, units="time", trim=False)

    if len(beat_times) < 8:
        tempo_frames = librosa.feature.tempo(y=y, sr=sr, aggregate=None)
        bpm = float(np.median(tempo_frames)) if len(tempo_frames) > 0 else 120.0
        if not (20 <= bpm <= 400):
            bpm = 120.0
        logger.info("Beat tracking sparse (%d beats) — constant grid at %.1f BPM", len(beat_times), bpm)
        beat_times = np.arange(0.0, max(duration_s, len(y) / sr), 60.0 / bpm)

    grid = BeatGrid(beat_times, duration_s)
    logger.info("Beat grid: %d beats, %.1f BPM, %d measures", len(beat_times), grid.bpm, grid.total_measures)
    return grid

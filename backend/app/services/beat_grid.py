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
_DEFAULT_SLOTS_PER_QUARTER = 4    # 16 slots per measure (16th-note grid) — tab path


class BeatGrid:
    """Maps absolute times to (measure, slot) using detected beat positions.

    `slots_per_quarter` sets the quantization resolution: 4 → 16th-note grid
    (16 slots/measure, used by the tab path), 8 → 32nd-note grid (32 slots,
    used by the chiptune path so fast vocal/guitar passages aren't collapsed).
    Callers that emit slot-based data must stamp `slots_per_measure` so the
    frontend divides each measure by the matching number.
    """

    def __init__(
        self,
        beat_times: np.ndarray,
        duration_s: float,
        slots_per_quarter: int = _DEFAULT_SLOTS_PER_QUARTER,
    ):
        self.beat_times = np.asarray(beat_times, dtype=float)
        self.slots_per_quarter = slots_per_quarter
        self.slots_per_measure = _BEATS_PER_MEASURE_QUARTERS * slots_per_quarter
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
        global_slot = int(round(self._fractional_beat(t) * self.slots_per_quarter))
        global_slot = max(0, min(global_slot, self.total_measures * self.slots_per_measure - 1))
        return global_slot // self.slots_per_measure, global_slot % self.slots_per_measure

    def duration_slots(self, start_s: float, end_s: float) -> float:
        """Note length in slot units, beat-relative (tempo drift cancelled)."""
        return (self._fractional_beat(end_s) - self._fractional_beat(start_s)) * self.slots_per_quarter


def build_beat_grid(
    audio_path: str,
    duration_ms: int,
    slots_per_quarter: int = _DEFAULT_SLOTS_PER_QUARTER,
) -> BeatGrid:
    """Track beats on the full mix and return a BeatGrid.

    Falls back to a constant grid from the median frame tempo when the tracker
    finds too few beats (e.g. ambient tracks with no percussion).

    `slots_per_quarter` controls quantization resolution (4 → 16th notes,
    8 → 32nd notes). See BeatGrid.
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

    grid = BeatGrid(beat_times, duration_s, slots_per_quarter=slots_per_quarter)
    logger.info(
        "Beat grid: %d beats, %.1f BPM, %d measures, %d slots/measure",
        len(beat_times), grid.bpm, grid.total_measures, grid.slots_per_measure,
    )
    return grid

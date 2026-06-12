"""
Chiptune generation pipeline: Spotify track → multi-instrument chiptune data.

Two paths, tried in order (same strategy as audio_pipeline):
  A. Songsterr — convert the official tab JSON into chiptune_data. Fast and
                 the notes are human-transcribed.
  B. ML fallback:
     1. yt-dlp      — download audio
     2. Demucs      — separate stems (vocals, guitar, piano, bass, drums)
     3. basic-pitch  — transcribe vocals (melody, guitar fallback), harmony, bass
     4. Drums        — band-split onset detection on drums stem → beat patterns
     5. Builder      — assemble chiptune_data JSON

chiptune_data schema:
{
  "bpm": 120.0,
  "tracks": {
    "melody": {"waveform": "square", "sections": [...]},
    "bass":   {"waveform": "triangle", "sections": [...]},
    "drums":  {"waveform": "noise",    "patterns": [...]}
  }
}

Section format (melody/bass):
  {"name": "Section N", "measures": [{"notes": [{"pitch": 64, "beat": 0}, ...]}]}

Drum pattern format:
  [{"measure": 0, "beat": 2, "type": "kick"}, ...]
"""

import asyncio
import logging
import shutil
import subprocess
import tempfile
import threading
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.config import settings
from app.models.chiptune import ChiptuneGeneration
from app.models.track import Track
from app.services.songsterr_client import SongsterrClient, SongsterrNotFound
from app.services.songsterr_to_chiptune import build_chiptune_data

logger = logging.getLogger(__name__)

_BEATS_PER_MEASURE = 16
_MEASURES_PER_SECTION = 4
_MIN_VELOCITY = 20

_pipeline_lock = threading.Lock()

CURRENT_ALGORITHM = "2.5.0"  # 2.5.0: rhythm track owns harmony bed (lead demoted); solos featured in instrumental runs


# ── Path A: Songsterr ─────────────────────────────────────────────────────────

def _try_songsterr_chiptune(title: str, artist: str, on_step) -> dict | None:
    """Look the song up on Songsterr and build chiptune_data from its official
    JSON. Returns None when there is no usable match — caller falls back to ML."""
    try:
        with SongsterrClient() as client:
            on_step("searching_songsterr")
            results = client.search(artist, title)
            best = client.pick_best_match(results, artist, title)
            if not best:
                logger.info("Songsterr: no chiptune match for %s — %s", artist, title)
                return None

            song_id = int(best["songId"])
            on_step("fetching_songsterr_meta")
            state = client.get_state_meta(song_id)

            on_step("fetching_songsterr_tabs")
            # Vocal tracks are fetched too — Songsterr encodes the sung melody
            # as notes, and that's the best melody source for a chiptune.
            tracks: list[tuple] = []
            for t in state.tracks:
                if t.is_empty:
                    continue
                try:
                    data = client.get_track_data(song_id, state.revision_id, state.image, t.part_id)
                except Exception as e:
                    logger.warning("Songsterr part %s fetch failed: %s", t.part_id, e)
                    continue
                tracks.append((t, data))

            if not tracks:
                return None

            on_step("building")
            return build_chiptune_data(state, tracks)

    except SongsterrNotFound as e:
        logger.info("Songsterr chiptune lookup failed: %s", e)
        return None
    except Exception:
        logger.warning("Songsterr chiptune path crashed; falling back to ML", exc_info=True)
        return None


# ── Step 1: download (reuse from audio_pipeline) ──────────────────────────────

def _download_audio(work_dir: str, title: str, artist: str) -> str:
    import yt_dlp

    query = f"ytsearch1:{artist} - {title} official audio"
    output_template = str(Path(work_dir) / "audio.%(ext)s")
    ydl_opts = {
        "format": "bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio/best",
        "outtmpl": output_template,
        "postprocessors": [{"key": "FFmpegExtractAudio", "preferredcodec": "wav"}],
        "quiet": True,
        "no_warnings": True,
        "noplaylist": True,
        "extractor_args": {"youtube": {"skip": ["dash", "hls"]}},
    }
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        ydl.download([query])

    wav = Path(work_dir) / "audio.wav"
    if not wav.exists():
        raise FileNotFoundError("yt-dlp did not produce audio.wav")
    return str(wav)


# ── Step 2: Demucs 4-stem separation ─────────────────────────────────────────

def _separate_stems(work_dir: str, audio_path: str) -> dict[str, str]:
    """Run htdemucs_6s and return paths for vocals, drums, bass, guitar, piano stems."""
    out_dir = Path(work_dir) / "demucs_out"
    out_dir.mkdir()

    cmd = [
        "python", "-m", "demucs",
        "-n", "htdemucs_6s",
        "-d", "cuda",
        "--overlap", "0.4",
        "--out", str(out_dir),
        audio_path,
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=1800)
    if result.returncode != 0:
        raise RuntimeError(f"Demucs failed:\n{result.stderr[-1000:]}")

    base = out_dir / "htdemucs_6s" / "audio"
    stems = {}
    for name in ("vocals", "drums", "bass", "guitar", "piano"):
        p = base / f"{name}.wav"
        if not p.exists():
            raise FileNotFoundError(f"Demucs stem not found: {p}")
        stems[name] = str(p)

    return stems


# ── Step 3: transcribe tonal stem → sections ─────────────────────────────────

def _transcribe_tonal(
    audio_path: str,
    grid,  # BeatGrid
    min_freq: float,
    max_freq: float,
    max_per_slot: int = 1,
    melodic: bool = False,
) -> tuple[list[dict], int]:
    """Run basic-pitch on a stem and return (sections, note_count).

    Notes are snapped to the detected beat grid instead of a constant-BPM
    division, so they stay in the right measure even when the tempo drifts.

    `melodic=True` picks one note per slot favouring contour continuity
    (small jumps from the previous pitch) over raw loudness — right for a
    vocal line, where basic-pitch often adds spurious octave/harmonic notes.

    Empty interior measures are KEPT: the frontend walks each track's sections
    sequentially, so dropping a silent chunk in one track would shift all its
    later notes earlier and desync it from the others.
    """
    from basic_pitch.inference import predict
    from basic_pitch import ICASSP_2022_MODEL_PATH

    _, _, note_events = predict(
        audio_path,
        ICASSP_2022_MODEL_PATH,
        onset_threshold=0.35,
        frame_threshold=0.25,
        minimum_note_length=50,
        minimum_frequency=min_freq,
        maximum_frequency=max_freq,
    )

    total_measures = grid.total_measures

    # (measure, beat) → list of (pitch, velocity, dur_beats)
    slots: dict[tuple[int, int], list[tuple[int, float, float]]] = {}

    for event in note_events:
        start_s = float(event[0])
        end_s   = float(event[1])
        pitch   = int(event[2])
        velocity = float(event[3])

        if velocity < _MIN_VELOCITY / 127:
            continue

        m_idx, beat = grid.slot(start_s)
        dur_beats = max(0.5, min(8.0, grid.duration_slots(start_s, end_s)))

        key = (m_idx, beat)
        if key not in slots:
            slots[key] = []
        slots[key].append((pitch, velocity, dur_beats))

    notes_by_measure: list[list[dict]] = [[] for _ in range(total_measures)]
    note_count = 0
    prev_pitch: int | None = None

    for key in sorted(slots.keys()):
        m_idx, beat = key
        candidates = slots[key]
        if melodic:
            def _score(c: tuple[int, float, float]) -> float:
                jump = abs(c[0] - prev_pitch) if prev_pitch is not None else 0
                return c[1] - 0.02 * jump
            top = [max(candidates, key=_score)]
            prev_pitch = top[0][0]
        else:
            top = sorted(candidates, key=lambda x: x[1], reverse=True)[:max_per_slot]
        for pitch, _, dur_beats in top:
            notes_by_measure[m_idx].append({
                "pitch": pitch,
                "beat":  beat,
                "dur":   round(dur_beats, 2),
            })
            note_count += 1

    sections = []
    for i in range(0, total_measures, _MEASURES_PER_SECTION):
        chunk = notes_by_measure[i: i + _MEASURES_PER_SECTION]
        sections.append({
            "name": f"Section {len(sections) + 1}",
            "measures": [{"notes": m} for m in chunk],
        })

    if not sections:
        sections = [{"name": "Section 1", "measures": [{"notes": []}]}]

    return sections, note_count


# ── Step 4: drum detection ────────────────────────────────────────────────────

# Per-instrument frequency bands for onset detection on the drums stem.
_DRUM_BANDS: list[tuple[str, float | None, float | None]] = [
    ("kick",  None,   150.0),   # lowpass
    ("snare", 200.0,  1800.0),  # bandpass — snare body + crack
    ("hihat", 5000.0, None),    # highpass — hats and cymbals
]


def _detect_drums(drums_path: str, grid) -> list[dict]:
    """
    Detect drum hits from the drums stem with band-split onset detection:
    each instrument gets its own filtered signal and onset envelope, so a kick
    and a hi-hat on the same beat are both detected (the old single-pass
    spectral-centroid version could only keep one hit per slot).
    """
    import librosa
    import numpy as np
    from scipy.signal import butter, sosfiltfilt

    y, sr = librosa.load(drums_path, sr=22050, mono=True)
    total_s = grid.duration_s

    patterns: list[dict] = []
    seen: set[tuple[int, int, str]] = set()  # (measure, beat, type)

    for drum_type, lo, hi in _DRUM_BANDS:
        if lo is None:
            sos = butter(4, hi, btype="lowpass", fs=sr, output="sos")
        elif hi is None:
            sos = butter(4, lo, btype="highpass", fs=sr, output="sos")
        else:
            sos = butter(4, [lo, hi], btype="bandpass", fs=sr, output="sos")
        band = sosfiltfilt(sos, y)

        # Skip near-silent bands (e.g. no hi-hats) to avoid onsets from bleed.
        if float(np.max(np.abs(band))) < 1e-3:
            continue

        onset_times = librosa.onset.onset_detect(
            y=band.astype(np.float32), sr=sr, units="time", backtrack=False,
        )

        for t in onset_times:
            if t > total_s:
                break
            m_idx, beat = grid.slot(float(t))
            key = (m_idx, beat, drum_type)
            if key in seen:
                continue
            seen.add(key)
            patterns.append({"measure": m_idx, "beat": beat, "type": drum_type})

    patterns.sort(key=lambda p: (p["measure"], p["beat"]))
    return patterns


# ── Synchronous pipeline ──────────────────────────────────────────────────────

# Below this many transcribed vocal notes the song is treated as instrumental
# (or the vocal stem as too noisy) and the guitar stem carries the melody.
_MIN_VOCAL_NOTES = 30

def _run_chiptune_sync(
    title: str,
    artist: str,
    duration_ms: int,
    on_step,
) -> dict:
    # Try Songsterr first — exact human-transcribed notes, no GPU needed.
    songsterr_data = _try_songsterr_chiptune(title, artist, on_step)
    if songsterr_data is not None:
        return songsterr_data

    with _pipeline_lock:
        work_dir = tempfile.mkdtemp(prefix="maketabs_chiptune_")
        try:
            logger.info("Chiptune pipeline start: %s — %s", artist, title)

            on_step("downloading")
            audio = _download_audio(work_dir, title, artist)

            on_step("separating")
            stems = _separate_stems(work_dir, audio)

            on_step("analyzing")
            from app.services.beat_grid import build_beat_grid
            grid = build_beat_grid(audio, duration_ms)

            on_step("transcribing")
            # Melody comes from the vocals — that's the line people recognize
            # a song by. Guitar takes over when the song is instrumental.
            vocal_sections, vocal_notes = _transcribe_tonal(
                stems["vocals"], grid,
                min_freq=80.0, max_freq=1100.0,
                melodic=True,
            )
            guitar_sections, guitar_notes = _transcribe_tonal(
                stems["guitar"], grid,
                min_freq=80.0, max_freq=4000.0,
                max_per_slot=2,
            )

            if vocal_notes >= _MIN_VOCAL_NOTES:
                melody_sections = vocal_sections
                harmony_sections = guitar_sections
                logger.info("Melody from vocals (%d notes); harmony from guitar (%d)", vocal_notes, guitar_notes)
            else:
                # Instrumental: melody from guitar (single line), harmony from piano.
                melody_sections, melody_notes = _transcribe_tonal(
                    stems["guitar"], grid,
                    min_freq=150.0, max_freq=4000.0,
                    melodic=True,
                )
                harmony_sections, _ = _transcribe_tonal(
                    stems["piano"], grid,
                    min_freq=80.0, max_freq=4000.0,
                    max_per_slot=2,
                )
                logger.info("Instrumental (vocals=%d notes): melody from guitar (%d notes)", vocal_notes, melody_notes)

            bass_sections, _ = _transcribe_tonal(
                stems["bass"], grid,
                min_freq=40.0, max_freq=400.0,
                max_per_slot=1,
            )

            on_step("building")
            drum_patterns = _detect_drums(stems["drums"], grid)

            chiptune_data = {
                "bpm": round(grid.bpm, 1),
                "source": "ml",
                "tracks": {
                    "melody":  {"waveform": "square",   "sections": melody_sections},
                    "harmony": {"waveform": "sawtooth", "sections": harmony_sections},
                    "bass":    {"waveform": "triangle", "sections": bass_sections},
                    "drums":   {"waveform": "noise",    "patterns": drum_patterns},
                },
            }

            logger.info(
                "Chiptune built — melody=%d, harmony=%d, bass=%d sections, drums=%d events",
                len(melody_sections), len(harmony_sections), len(bass_sections), len(drum_patterns),
            )
            return chiptune_data

        except Exception:
            logger.exception("Chiptune pipeline failed for %s — %s", artist, title)
            raise
        finally:
            shutil.rmtree(work_dir, ignore_errors=True)


# ── Public coroutine ──────────────────────────────────────────────────────────

async def process_chiptune_job(
    job_id: str,
    title: str,
    artist: str,
    duration_ms: int,
) -> None:
    engine = create_async_engine(settings.database_url, echo=False)
    Session = async_sessionmaker(engine, expire_on_commit=False)

    async def _get_job(session) -> ChiptuneGeneration | None:
        r = await session.execute(
            select(ChiptuneGeneration).where(ChiptuneGeneration.id == job_id)
        )
        return r.scalar_one_or_none()

    async with Session() as session:
        job = await _get_job(session)
        if job is None:
            await engine.dispose()
            return
        job.status = "processing"
        await session.commit()

    loop = asyncio.get_running_loop()

    async def _update_step(step: str) -> None:
        async with Session() as s:
            j = await _get_job(s)
            if j:
                j.current_step = step
                await s.commit()

    def on_step(step: str) -> None:
        future = asyncio.run_coroutine_threadsafe(_update_step(step), loop)
        try:
            future.result(timeout=10)
        except Exception:
            pass

    try:
        chiptune_data = await asyncio.to_thread(
            _run_chiptune_sync, title, artist, duration_ms, on_step
        )

        async with Session() as session:
            job = await _get_job(session)
            if job is None:
                return
            job.status = "done"
            job.completed_at = datetime.now(timezone.utc)
            job.chiptune_data = chiptune_data
            await session.commit()

    except Exception as exc:
        async with Session() as session:
            job = await _get_job(session)
            if job:
                job.status = "failed"
                job.error_message = str(exc)[:500]
                await session.commit()
    finally:
        await engine.dispose()

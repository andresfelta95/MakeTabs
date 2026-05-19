"""
Audio processing pipeline: Spotify track → guitar tab JSON.

Pipeline steps (run in a thread pool — CPU/IO-heavy):
  1. yt-dlp      — download audio from YouTube by "artist - title" query
  2. Demucs      — source-separate to isolate guitar/keys stem ("other")
  3. Energy check — decide whether the track actually has guitar
  4. basic-pitch  — transcribe guitar stem to MIDI-like note events
  5. Converter    — map MIDI pitches to string/fret positions and build tab JSON

The coroutine `process_tab_job` is the public entry point; it is meant to be
dispatched via FastAPI BackgroundTasks.  It creates its own DB session so it
can update job status throughout the pipeline.
"""

import asyncio
import logging
import shutil
import subprocess
import tempfile
import threading
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.config import settings
from app.models.tab import TabGeneration
from app.models.track import Track

logger = logging.getLogger(__name__)

# ── Guitar tuning constants ───────────────────────────────────────────────────
# MIDI note for each open string (1=low E, 6=high e)
_OPEN_MIDI = {1: 40, 2: 45, 3: 50, 4: 55, 5: 59, 6: 64}  # E2 A2 D3 G3 B3 E4
_TUNING_NAMES = ["E", "A", "D", "G", "B", "e"]
_MAX_FRET = 22
_MIN_VELOCITY = 50  # filter out very quiet (likely noise) notes

# Serialize heavy pipeline jobs — prevents OOM from concurrent Demucs runs
_pipeline_lock = threading.Lock()


# ── MIDI → string / fret ─────────────────────────────────────────────────────

def _midi_to_guitar(pitch: int) -> tuple[int, int] | None:
    """Return (string_num, fret) for a MIDI pitch using standard tuning.

    Prefers the lowest-string position that keeps the fret in a comfortable
    range (0-22).  Returns None if the note is out of guitar range.
    """
    best: tuple[int, int] | None = None
    best_fret = _MAX_FRET + 1

    for string_num, open_pitch in _OPEN_MIDI.items():
        fret = pitch - open_pitch
        if 0 <= fret <= _MAX_FRET and fret < best_fret:
            best_fret = fret
            best = (string_num, fret)

    return best


# ── Step 1: download audio ────────────────────────────────────────────────────

def _download_audio(work_dir: str, title: str, artist: str) -> str:
    """Use yt-dlp to search YouTube and download audio as WAV."""
    import yt_dlp

    query = f"ytsearch1:{artist} - {title} official audio"
    output_template = str(Path(work_dir) / "audio.%(ext)s")

    ydl_opts = {
        "format": "bestaudio/best",
        "outtmpl": output_template,
        "postprocessors": [{
            "key": "FFmpegExtractAudio",
            "preferredcodec": "wav",
            "preferredquality": "192",
        }],
        "quiet": True,
        "no_warnings": True,
        "noplaylist": True,
    }

    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        ydl.download([query])

    wav = Path(work_dir) / "audio.wav"
    if not wav.exists():
        raise FileNotFoundError("yt-dlp did not produce audio.wav")
    return str(wav)


# ── Step 2: source separation (Demucs) ───────────────────────────────────────

def _separate_guitar(work_dir: str, audio_path: str) -> str:
    """Run Demucs (htdemucs) and return path to the 'other' stem (guitar+keys)."""
    out_dir = Path(work_dir) / "demucs_out"
    out_dir.mkdir()

    cmd = [
        "python", "-m", "demucs",
        "--two-stems", "other",     # produces: other.wav, no_other.wav
        "-n", "htdemucs",
        "--out", str(out_dir),
        audio_path,
    ]

    result = subprocess.run(cmd, capture_output=True, text=True, timeout=900)
    if result.returncode != 0:
        raise RuntimeError(f"Demucs failed:\n{result.stderr[-1000:]}")

    # Output path: <out_dir>/htdemucs/audio/other.wav
    guitar_path = out_dir / "htdemucs" / "audio" / "other.wav"
    if not guitar_path.exists():
        raise FileNotFoundError(f"Demucs other stem not found at {guitar_path}")

    return str(guitar_path)


# ── Step 3: guitar energy detection ──────────────────────────────────────────

def _has_guitar_energy(audio_path: str, threshold: float = 0.02) -> bool:
    """Return True if the stem has enough RMS energy to likely contain guitar."""
    import librosa
    y, _ = librosa.load(audio_path, sr=None, mono=True)
    rms = float(librosa.feature.rms(y=y).mean())
    logger.info("Guitar stem RMS energy: %.4f (threshold %.4f)", rms, threshold)
    return rms > threshold


# ── Step 4: note transcription (basic-pitch) ─────────────────────────────────

def _transcribe(audio_path: str) -> tuple[np.ndarray, float]:
    """Run basic-pitch and estimate BPM. Returns (note_events, bpm)."""
    import librosa
    from basic_pitch.inference import predict
    from basic_pitch import ICASSP_2022_MODEL_PATH

    _, _, note_events = predict(
        audio_path,
        ICASSP_2022_MODEL_PATH,
        onset_threshold=0.5,
        frame_threshold=0.3,
        minimum_note_length=58,
        minimum_frequency=80.0,
        maximum_frequency=2000.0,
    )

    y, sr = librosa.load(audio_path, sr=None, mono=True)
    tempo, _ = librosa.beat.beat_track(y=y, sr=sr)
    bpm = float(tempo) if float(tempo) > 20 else 120.0

    return note_events, bpm


# ── Step 5: build tab JSON ────────────────────────────────────────────────────

def _build_tab(note_events: np.ndarray, bpm: float, duration_ms: int) -> dict:
    """Convert basic-pitch note events into the tab JSON consumed by the frontend."""
    BEATS_PER_MEASURE = 4
    MEASURES_PER_SECTION = 8

    beat_dur = 60.0 / max(bpm, 20)
    measure_dur = BEATS_PER_MEASURE * beat_dur
    total_s = duration_ms / 1000
    total_measures = max(1, int(total_s / measure_dur) + 1)

    notes_by_measure: list[list[dict]] = [[] for _ in range(total_measures)]

    for event in note_events:
        start_s = float(event[0])
        pitch = int(event[2])
        velocity = float(event[3])

        if velocity < _MIN_VELOCITY / 127:  # basic-pitch velocity is 0.0–1.0
            continue

        pos = _midi_to_guitar(pitch)
        if pos is None:
            continue

        idx = min(int(start_s / measure_dur), total_measures - 1)
        string_num, fret = pos
        notes_by_measure[idx].append({"string": string_num, "fret": fret})

    # Group into sections of MEASURES_PER_SECTION, skipping fully empty sections
    sections = []
    for i in range(0, total_measures, MEASURES_PER_SECTION):
        chunk = notes_by_measure[i: i + MEASURES_PER_SECTION]
        if any(chunk):
            sections.append({
                "name": f"Section {len(sections) + 1}",
                "measures": [{"notes": m} for m in chunk],
            })

    if not sections:
        sections = [{"name": "Section 1", "measures": [{"notes": []}]}]

    return {
        "tuning": _TUNING_NAMES,
        "bpm": round(bpm, 1),
        "sections": sections,
    }


# ── Synchronous pipeline (runs in thread) ────────────────────────────────────

def _run_pipeline_sync(title: str, artist: str, duration_ms: int) -> dict:
    """Full blocking pipeline. Returns {"has_guitar": bool, "tab_data": dict|None}."""
    with _pipeline_lock:
        work_dir = tempfile.mkdtemp(prefix="maketabs_")
        try:
            logger.info("Pipeline start: %s — %s", artist, title)

            audio = _download_audio(work_dir, title, artist)
            logger.info("Audio downloaded: %s", audio)

            guitar = _separate_guitar(work_dir, audio)
            logger.info("Guitar separated: %s", guitar)

            if not _has_guitar_energy(guitar):
                logger.info("No guitar energy detected — skipping transcription")
                return {"has_guitar": False, "tab_data": None}

            note_events, bpm = _transcribe(guitar)
            logger.info("Transcribed. BPM=%.1f, notes=%d", bpm, len(note_events))

            tab_data = _build_tab(note_events, bpm, duration_ms)
            return {"has_guitar": True, "tab_data": tab_data}

        except Exception:
            logger.exception("Pipeline failed for %s — %s", artist, title)
            raise
        finally:
            shutil.rmtree(work_dir, ignore_errors=True)


# ── Public coroutine (BackgroundTasks entry point) ───────────────────────────

async def process_tab_job(
    tab_gen_id: str,
    title: str,
    artist: str,
    duration_ms: int,
) -> None:
    """Update job status, run the pipeline in a thread, persist results."""
    engine = create_async_engine(settings.database_url, echo=False)
    Session = async_sessionmaker(engine, expire_on_commit=False)

    async def _get_job(session) -> TabGeneration | None:
        r = await session.execute(
            select(TabGeneration).where(TabGeneration.id == tab_gen_id)
        )
        return r.scalar_one_or_none()

    # Mark as processing
    async with Session() as session:
        job = await _get_job(session)
        if job is None:
            await engine.dispose()
            return
        job.status = "processing"
        await session.commit()

    try:
        result = await asyncio.to_thread(_run_pipeline_sync, title, artist, duration_ms)

        async with Session() as session:
            job = await _get_job(session)
            if job is None:
                return

            job.status = "done"
            job.completed_at = datetime.now(timezone.utc)
            job.tab_data = result["tab_data"]

            track_r = await session.execute(
                select(Track).where(Track.id == job.track_id)
            )
            track = track_r.scalar_one_or_none()
            if track:
                track.has_guitar = result["has_guitar"]

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

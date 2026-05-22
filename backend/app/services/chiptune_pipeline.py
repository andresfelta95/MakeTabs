"""
Chiptune generation pipeline: Spotify track → multi-instrument chiptune data.

Pipeline steps:
  1. yt-dlp      — download audio
  2. Demucs      — separate into 4 stems: drums, bass, other, vocals
  3. basic-pitch  — transcribe melody (other stem) and bass stems to MIDI
  4. Drums        — onset detection on drums stem → beat patterns
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

logger = logging.getLogger(__name__)

_BEATS_PER_MEASURE = 8
_MEASURES_PER_SECTION = 4
_MIN_VELOCITY = 50

_pipeline_lock = threading.Lock()

CURRENT_ALGORITHM = "1.0.0"


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
    """Run htdemucs and return paths for drums, bass, other stems."""
    out_dir = Path(work_dir) / "demucs_out"
    out_dir.mkdir()

    cmd = [
        "python", "-m", "demucs",
        "-n", "htdemucs",
        "--out", str(out_dir),
        audio_path,
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=1800)
    if result.returncode != 0:
        raise RuntimeError(f"Demucs failed:\n{result.stderr[-1000:]}")

    base = out_dir / "htdemucs" / "audio"
    stems = {}
    for name in ("drums", "bass", "other"):
        p = base / f"{name}.wav"
        if not p.exists():
            raise FileNotFoundError(f"Demucs stem not found: {p}")
        stems[name] = str(p)

    return stems


# ── Step 3: transcribe tonal stem → sections ─────────────────────────────────

def _transcribe_tonal(
    audio_path: str,
    bpm: float,
    duration_ms: int,
    min_freq: float,
    max_freq: float,
) -> list[dict]:
    """Run basic-pitch on a stem and return sections with {pitch, beat} notes."""
    from basic_pitch.inference import predict
    from basic_pitch import ICASSP_2022_MODEL_PATH

    _, _, note_events = predict(
        audio_path,
        ICASSP_2022_MODEL_PATH,
        onset_threshold=0.6,
        frame_threshold=0.4,
        minimum_note_length=80,
        minimum_frequency=min_freq,
        maximum_frequency=max_freq,
    )

    quarter_dur = 60.0 / max(bpm, 20)
    measure_dur = 4 * quarter_dur
    beat_dur = measure_dur / _BEATS_PER_MEASURE
    total_s = duration_ms / 1000
    total_measures = max(1, int(total_s / measure_dur) + 1)

    # (measure, beat) → (pitch, velocity) — loudest note per slot
    best: dict[tuple[int, int], tuple[int, float]] = {}

    for event in note_events:
        start_s = float(event[0])
        pitch = int(event[2])
        velocity = float(event[3])

        if velocity < _MIN_VELOCITY / 127:
            continue

        m_idx = min(int(start_s / measure_dur), total_measures - 1)
        beat = min(int((start_s % measure_dur) / beat_dur), _BEATS_PER_MEASURE - 1)
        key = (m_idx, beat)
        if key not in best or velocity > best[key][1]:
            best[key] = (pitch, velocity)

    notes_by_measure: list[list[dict]] = [[] for _ in range(total_measures)]
    for (m_idx, beat), (pitch, _) in best.items():
        notes_by_measure[m_idx].append({"pitch": pitch, "beat": beat})

    sections = []
    for i in range(0, total_measures, _MEASURES_PER_SECTION):
        chunk = notes_by_measure[i: i + _MEASURES_PER_SECTION]
        if any(chunk):
            sections.append({
                "name": f"Section {len(sections) + 1}",
                "measures": [{"notes": m} for m in chunk],
            })

    if not sections:
        sections = [{"name": "Section 1", "measures": [{"notes": []}]}]

    return sections


# ── Step 4: drum detection ────────────────────────────────────────────────────

def _detect_drums(drums_path: str, bpm: float, duration_ms: int) -> list[dict]:
    """
    Detect drum onsets from the drums stem and classify them into
    kick / snare / hi-hat based on spectral centroid.
    """
    import librosa
    import numpy as np

    y, sr = librosa.load(drums_path, sr=22050, mono=True)

    quarter_dur = 60.0 / max(bpm, 20)
    measure_dur = 4 * quarter_dur
    beat_dur = measure_dur / _BEATS_PER_MEASURE
    total_s = duration_ms / 1000
    total_measures = max(1, int(total_s / measure_dur) + 1)

    # Detect onsets
    onset_frames = librosa.onset.onset_detect(y=y, sr=sr, units="samples", backtrack=True)

    patterns: list[dict] = []
    seen: set[tuple[int, int]] = set()  # deduplicate (measure, beat)

    for frame in onset_frames:
        t = frame / sr
        if t > total_s:
            break

        m_idx = min(int(t / measure_dur), total_measures - 1)
        beat = min(int((t % measure_dur) / beat_dur), _BEATS_PER_MEASURE - 1)

        if (m_idx, beat) in seen:
            continue
        seen.add((m_idx, beat))

        # Spectral centroid of a small window around the onset
        start = max(0, frame - 512)
        end = min(len(y), frame + 2048)
        window = y[start:end]
        if len(window) < 512:
            continue

        centroid = float(librosa.feature.spectral_centroid(y=window, sr=sr).mean())

        if centroid < 400:
            drum_type = "kick"
        elif centroid < 2000:
            drum_type = "snare"
        else:
            drum_type = "hihat"

        patterns.append({"measure": m_idx, "beat": beat, "type": drum_type})

    return patterns


# ── Step 5: get BPM from the full mix ────────────────────────────────────────

def _estimate_bpm(audio_path: str) -> float:
    import librosa
    y, sr = librosa.load(audio_path, sr=None, mono=True, duration=60)
    tempo, _ = librosa.beat.beat_track(y=y, sr=sr)
    bpm = float(tempo)
    if bpm > 140:
        bpm /= 2.0
    return max(bpm, 60.0)


# ── Synchronous pipeline ──────────────────────────────────────────────────────

def _run_chiptune_sync(
    title: str,
    artist: str,
    duration_ms: int,
    on_step,
) -> dict:
    with _pipeline_lock:
        work_dir = tempfile.mkdtemp(prefix="maketabs_chiptune_")
        try:
            logger.info("Chiptune pipeline start: %s — %s", artist, title)

            on_step("downloading")
            audio = _download_audio(work_dir, title, artist)

            on_step("separating")
            stems = _separate_stems(work_dir, audio)

            on_step("analyzing")
            bpm = _estimate_bpm(audio)
            logger.info("BPM: %.1f", bpm)

            on_step("transcribing")
            melody_sections = _transcribe_tonal(
                stems["other"], bpm, duration_ms,
                min_freq=150.0, max_freq=4000.0,
            )
            bass_sections = _transcribe_tonal(
                stems["bass"], bpm, duration_ms,
                min_freq=40.0, max_freq=400.0,
            )

            on_step("building")
            drum_patterns = _detect_drums(stems["drums"], bpm, duration_ms)

            chiptune_data = {
                "bpm": round(bpm, 1),
                "tracks": {
                    "melody": {"waveform": "square",   "sections": melody_sections},
                    "bass":   {"waveform": "triangle", "sections": bass_sections},
                    "drums":  {"waveform": "noise",    "patterns": drum_patterns},
                },
            }

            logger.info(
                "Chiptune built — melody sections=%d, bass sections=%d, drum events=%d",
                len(melody_sections), len(bass_sections), len(drum_patterns),
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

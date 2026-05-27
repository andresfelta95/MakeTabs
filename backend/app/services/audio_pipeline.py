"""
Audio processing pipeline: Spotify track → guitar tab JSON.

Two paths, tried in order:
  A. Songsterr — pull the official tab JSON from Songsterr's public API + CDN,
                 convert to display format, synth its MIDI to MP3.  Fast (~3s)
                 and the notes are human-transcribed, not ML-guessed.
  B. ML fallback — when Songsterr has no match, fall through to the original
                   yt-dlp → Demucs → basic-pitch pipeline below.

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
from app.services.songsterr_client import SongsterrClient, SongsterrNotFound
from app.services.songsterr_to_tab import build_midi_bytes, build_tab_data
from app.services.tab_audio_renderer import render_midi_to_wav

logger = logging.getLogger(__name__)

# ── Guitar tuning constants ───────────────────────────────────────────────────
# MIDI note for each open string (1=low E, 6=high e)
_OPEN_MIDI = {1: 40, 2: 45, 3: 50, 4: 55, 5: 59, 6: 64}  # E2 A2 D3 G3 B3 E4
_TUNING_NAMES = ["E", "A", "D", "G", "B", "e"]
_MAX_FRET = 22
_MIN_VELOCITY = 10  # filter out very quiet (likely noise) notes; solo notes in separated stems can be quiet

# Tab grid resolution
_BEATS_PER_MEASURE = 16   # sixteenth-note slots (quarter note = 4 slots)
_MEASURES_PER_SECTION = 4 # keep display width ≈ 96 chars (8 × 4 × 3)

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
        "format": "bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio/best",
        "outtmpl": output_template,
        "postprocessors": [{
            "key": "FFmpegExtractAudio",
            "preferredcodec": "wav",
        }],
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


# ── Step 2: source separation (Demucs) ───────────────────────────────────────

def _separate_guitar(work_dir: str, audio_path: str) -> str:
    """Run Demucs (htdemucs_6s) and return path to the dedicated 'guitar' stem."""
    out_dir = Path(work_dir) / "demucs_out"
    out_dir.mkdir()

    cmd = [
        "python", "-m", "demucs",
        "-n", "htdemucs_6s",        # 6-stem model: guitar stem is separate from piano/keys
        "-d", "cuda",
        "--overlap", "0.4",
        "--out", str(out_dir),
        audio_path,
    ]

    result = subprocess.run(cmd, capture_output=True, text=True, timeout=1800)
    if result.returncode != 0:
        raise RuntimeError(f"Demucs failed:\n{result.stderr[-1000:]}")

    base = out_dir / "htdemucs_6s" / "audio"
    guitar_path = base / "guitar.wav"
    other_path  = base / "other.wav"
    if not guitar_path.exists():
        raise FileNotFoundError(f"Demucs guitar stem not found at {guitar_path}")

    # Mix guitar + other stems: htdemucs_6s sometimes routes lead guitar content
    # (solos, high-register runs) into "other" rather than "guitar".
    # Blending at 50% brings those notes back without heavily polluting with piano/synth
    # (which get filtered later by _midi_to_guitar anyway).
    import librosa
    import soundfile as sf
    y_g, sr = librosa.load(str(guitar_path), sr=None, mono=True)
    if other_path.exists():
        y_o, _ = librosa.load(str(other_path), sr=sr, mono=True)
        n = min(len(y_g), len(y_o))
        y_mixed = y_g[:n] + 0.5 * y_o[:n]
    else:
        y_mixed = y_g

    mixed_path = Path(work_dir) / "guitar_mixed.wav"
    sf.write(str(mixed_path), y_mixed, sr)
    return str(mixed_path)


# ── Step 3: guitar energy detection ──────────────────────────────────────────

def _has_guitar_energy(audio_path: str, threshold: float = 0.02) -> bool:
    """Return True if the stem has enough RMS energy to likely contain guitar."""
    import librosa
    y, _ = librosa.load(audio_path, sr=None, mono=True)
    rms = float(librosa.feature.rms(y=y).mean())
    logger.info("Guitar stem RMS energy: %.4f (threshold %.4f)", rms, threshold)
    return rms > threshold


# ── Step 4: note transcription (basic-pitch) ─────────────────────────────────

def _estimate_bpm(audio_path: str) -> float:
    """Estimate BPM from audio. Should be called on the full mix, not a stem."""
    import librosa
    y, sr = librosa.load(audio_path, sr=None, mono=True, duration=60)
    # Frame-by-frame tempo then take median — more robust than single beat_track estimate
    tempo_frames = librosa.feature.tempo(y=y, sr=sr, aggregate=None)
    bpm = float(np.median(tempo_frames)) if len(tempo_frames) > 0 else 120.0
    if bpm < 20:
        bpm = 120.0
    # Normalize to 60-130 BPM (typical guitar music range).
    # librosa frequently detects double-tempo on energetic rock; halving corrects it.
    while bpm > 130:
        bpm /= 2.0
    while bpm < 60:
        bpm *= 2.0
    logger.info("BPM detected: %.1f", bpm)
    return bpm


def _transcribe(audio_path: str) -> np.ndarray:
    """Run basic-pitch on the guitar stem. Returns note_events array."""
    from basic_pitch.inference import predict
    from basic_pitch import ICASSP_2022_MODEL_PATH

    _, _, note_events = predict(
        audio_path,
        ICASSP_2022_MODEL_PATH,
        onset_threshold=0.35,
        frame_threshold=0.25,
        minimum_note_length=50,
        minimum_frequency=82.0,   # E2 — lowest open string
        maximum_frequency=1300.0, # covers full 24-fret range + bends on high-e
    )
    return note_events


# ── Step 5: build tab sections ────────────────────────────────────────────────

def _build_sections(note_events: np.ndarray, bpm: float, duration_ms: int) -> list[dict]:
    """Convert note events into a list of tab sections."""
    quarter_dur = 60.0 / max(bpm, 20)
    measure_dur = 4 * quarter_dur              # always 4/4
    beat_dur = measure_dur / _BEATS_PER_MEASURE  # eighth-note slot width
    total_s = duration_ms / 1000
    total_measures = max(1, int(total_s / measure_dur) + 1)

    # (measure_idx, string) → {beat → (fret, velocity, dur_beats)} — keeps loudest per slot
    best: dict[tuple[int, int], dict[int, tuple[int, float, int]]] = {}

    for event in note_events:
        start_s = float(event[0])
        end_s   = float(event[1])
        pitch = int(event[2])
        velocity = float(event[3])

        if velocity < _MIN_VELOCITY / 127:
            continue

        pos = _midi_to_guitar(pitch)
        if pos is None:
            continue

        m_idx = min(int(start_s / measure_dur), total_measures - 1)
        beat = min(int((start_s % measure_dur) / beat_dur), _BEATS_PER_MEASURE - 1)
        dur_beats = max(1, round((end_s - start_s) / beat_dur))
        string_num, fret = pos
        key = (m_idx, string_num)
        if key not in best:
            best[key] = {}
        existing = best[key].get(beat)
        if existing is None or velocity > existing[1]:
            best[key][beat] = (fret, velocity, dur_beats)

    # Flatten into notes_by_measure
    notes_by_measure: list[list[dict]] = [[] for _ in range(total_measures)]
    for (m_idx, string_num), beats in best.items():
        for beat, (fret, _, dur_beats) in beats.items():
            notes_by_measure[m_idx].append({"string": string_num, "fret": fret, "beat": beat, "duration": dur_beats})

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


def _split_notes(note_events) -> tuple:
    """Split note events into lead (high register) and rhythm (low register)."""
    if not note_events:
        return [], []

    # note_events rows: [start_s, end_s, pitch, amplitude, pitch_bends]
    # pitch_bends is a variable-length array → can't use np.array(), use list ops
    pitches = [int(e[2]) for e in note_events]
    median_pitch = sorted(pitches)[len(pitches) // 2]
    lead = [e for e, p in zip(note_events, pitches) if p >= median_pitch]
    rhythm = [e for e, p in zip(note_events, pitches) if p < median_pitch]
    return lead, rhythm


def _beat_role(note_events: list, bpm: float, duration_ms: int) -> dict:
    """Count how many beat slots have 1 note (melodic) vs 2+ notes (chordal)."""
    quarter_dur = 60.0 / max(bpm, 20)
    measure_dur = 4 * quarter_dur
    beat_dur = measure_dur / _BEATS_PER_MEASURE
    total_s = duration_ms / 1000
    total_measures = max(1, int(total_s / measure_dur) + 1)

    slot_counts: dict[tuple[int, int], int] = {}
    for event in note_events:
        start_s = float(event[0])
        pitch = int(event[2])
        velocity = float(event[3])
        if velocity < _MIN_VELOCITY / 127 or _midi_to_guitar(pitch) is None:
            continue
        m_idx = min(int(start_s / measure_dur), total_measures - 1)
        beat = min(int((start_s % measure_dur) / beat_dur), _BEATS_PER_MEASURE - 1)
        slot_counts[(m_idx, beat)] = slot_counts.get((m_idx, beat), 0) + 1

    if not slot_counts:
        return {"chord_ratio": 0.0, "solo_ratio": 0.0, "occupied": 0}

    chord = sum(1 for c in slot_counts.values() if c >= 2)
    solo = sum(1 for c in slot_counts.values() if c == 1)
    total = chord + solo
    return {"chord_ratio": chord / total, "solo_ratio": solo / total, "occupied": total}


def _needs_two_guitars(
    lead_events: list,
    rhythm_events: list,
    bpm: float,
    duration_ms: int,
) -> bool:
    """True only when lead is melodic (single notes) and rhythm is chordal (multi-note beats)."""
    if len(lead_events) < 20 or len(rhythm_events) < 20:
        return False

    lead_role = _beat_role(lead_events, bpm, duration_ms)
    rhythm_role = _beat_role(rhythm_events, bpm, duration_ms)

    lead_is_melodic = lead_role["solo_ratio"] > 0.60    # mostly single notes
    rhythm_is_chordal = rhythm_role["chord_ratio"] > 0.20  # enough simultaneous notes

    logger.info(
        "Guitar roles — lead solo=%.2f chord=%.2f | rhythm solo=%.2f chord=%.2f → two=%s",
        lead_role["solo_ratio"], lead_role["chord_ratio"],
        rhythm_role["solo_ratio"], rhythm_role["chord_ratio"],
        lead_is_melodic and rhythm_is_chordal,
    )
    return lead_is_melodic and rhythm_is_chordal


def _assign_lyrics(sections: list[dict], lyrics_sections: list[dict]) -> list[dict]:
    """Add lyrics_section index to each tab section proportionally."""
    if not lyrics_sections:
        return sections
    n_lyrics = len(lyrics_sections)
    n_tab = len(sections)
    for i, section in enumerate(sections):
        section["lyrics_section"] = min(int(i * n_lyrics / n_tab), n_lyrics - 1)
    return sections


# ── Synchronous pipeline (runs in thread) ────────────────────────────────────

_AUDIO_STORE = Path("/app/audio")


def _try_songsterr(
    title: str,
    artist: str,
    tab_gen_id: str | None,
    on_step,
) -> dict | None:
    """Look the song up on Songsterr and build tab_data + MP3 from its official
    JSON. Returns None when Songsterr has no usable match — caller should fall
    back to the ML pipeline."""
    try:
        with SongsterrClient() as client:
            on_step("searching_songsterr")
            results = client.search(artist, title)
            best = client.pick_best_match(results, artist, title)
            if not best:
                logger.info("Songsterr: no match for %s — %s", artist, title)
                return None

            song_id = int(best["songId"])
            logger.info("Songsterr match: songId=%s (%s — %s)", song_id, best.get("artist"), best.get("title"))

            on_step("fetching_songsterr_meta")
            state = client.get_state_meta(song_id)

            # Pick guitar tracks; if none, this song isn't useful to us.
            guitar_tracks_meta = [t for t in state.tracks if t.is_guitar and not t.is_empty]
            if not guitar_tracks_meta:
                logger.info("Songsterr songId=%s has no guitar tracks", song_id)
                return None

            on_step("fetching_songsterr_tabs")
            all_tracks: list[tuple] = []  # for MIDI (all non-vocal)
            guitar_pairs: list[tuple] = []  # for tab_data display (guitar only)
            for t in state.tracks:
                if t.is_vocal or t.is_empty:
                    continue
                try:
                    data = client.get_track_data(song_id, state.revision_id, state.image, t.part_id)
                except (SongsterrNotFound, httpx_exc()) as e:
                    logger.warning("Songsterr part %s fetch failed: %s", t.part_id, e)
                    continue
                all_tracks.append((t, data))
                if t.is_guitar:
                    guitar_pairs.append((t, data))

            if not guitar_pairs:
                return None

            # BPM from the first guitar track's tempo automation.
            bpm = 120.0
            tempo = (guitar_pairs[0][1].get("automations") or {}).get("tempo") or []
            if tempo:
                bpm = float(tempo[0].get("bpm", 120))

            lyrics_sections: list[dict] = []
            if settings.genius_access_token:
                try:
                    from app.services.lyrics_service import fetch_lyrics_sections
                    lyrics_sections = fetch_lyrics_sections(title, artist, settings.genius_access_token)
                except Exception:
                    logger.warning("Lyrics fetch failed", exc_info=True)

            # Non-guitar accompaniment (bass/piano/drums/…) gets pre-computed as
            # absolute-time notes for the frontend oscillator player.
            accompaniment_pairs = [
                (t, d) for (t, d) in all_tracks if not t.is_guitar
            ]
            tab_data = build_tab_data(
                state, guitar_pairs, bpm, lyrics_sections,
                accompaniment_tracks=accompaniment_pairs,
            )

            # Synthesize all non-vocal tracks so the WAV sounds like the song,
            # not just one isolated guitar.
            if tab_gen_id:
                on_step("synthesizing_audio")
                try:
                    midi_bytes = build_midi_bytes(state, all_tracks)
                    _AUDIO_STORE.mkdir(parents=True, exist_ok=True)
                    out_wav = _AUDIO_STORE / f"{tab_gen_id}.wav"
                    if render_midi_to_wav(midi_bytes, out_wav):
                        logger.info("Songsterr WAV saved: %s", out_wav)
                    else:
                        logger.warning("Songsterr WAV render failed — tab still saved")
                except Exception:
                    logger.warning("MIDI synth failed", exc_info=True)

            return {"has_guitar": True, "tab_data": tab_data, "source": "songsterr"}

    except SongsterrNotFound as e:
        logger.info("Songsterr lookup failed: %s", e)
        return None
    except Exception:
        logger.warning("Songsterr path crashed; falling back to ML", exc_info=True)
        return None


def httpx_exc():
    """Return httpx's RequestError class. Imported lazily so the worker thread
    doesn't pay for httpx at module-load time."""
    import httpx
    return httpx.RequestError


def _run_pipeline_sync(
    title: str,
    artist: str,
    duration_ms: int,
    on_step,  # callable(step: str) -> None
    tab_gen_id: str | None = None,
) -> dict:
    """Full blocking pipeline. Returns {"has_guitar": bool, "tab_data": dict|None, "source": str}."""

    # Try Songsterr first — fast, and the tabs are accurate.
    songsterr_result = _try_songsterr(title, artist, tab_gen_id, on_step)
    if songsterr_result is not None:
        return songsterr_result

    with _pipeline_lock:
        work_dir = tempfile.mkdtemp(prefix="maketabs_")
        try:
            logger.info("ML pipeline start: %s — %s", artist, title)

            on_step("downloading")
            audio = _download_audio(work_dir, title, artist)
            logger.info("Audio downloaded: %s", audio)

            on_step("separating")
            guitar = _separate_guitar(work_dir, audio)
            logger.info("Guitar separated: %s", guitar)

            on_step("detecting")
            if not _has_guitar_energy(guitar):
                logger.info("No guitar energy detected — skipping transcription")
                return {"has_guitar": False, "tab_data": None, "source": "ml"}

            # Estimate BPM from full mix — drums make beat tracking far more reliable
            bpm = _estimate_bpm(audio)

            on_step("transcribing")
            note_events = _transcribe(guitar)
            logger.info("Transcribed. BPM=%.1f, notes=%d", bpm, len(note_events))

            on_step("building")
            lead_events, rhythm_events = _split_notes(note_events)

            lyrics_sections: list[dict] = []
            if settings.genius_access_token:
                from app.services.lyrics_service import fetch_lyrics_sections
                lyrics_sections = fetch_lyrics_sections(title, artist, settings.genius_access_token)
                logger.info("Lyrics: %d sections fetched", len(lyrics_sections))

            if _needs_two_guitars(lead_events, rhythm_events, bpm, duration_ms):
                logger.info("Two-guitar split: lead=%d notes, rhythm=%d notes", len(lead_events), len(rhythm_events))
                lead_sections = _build_sections(lead_events, bpm, duration_ms)
                rhythm_sections = _build_sections(rhythm_events, bpm, duration_ms)
                guitars = [
                    {"name": "Lead Guitar", "sections": _assign_lyrics(lead_sections, lyrics_sections)},
                    {"name": "Rhythm Guitar", "sections": _assign_lyrics(rhythm_sections, lyrics_sections)},
                ]
            else:
                logger.info("Single guitar: lead=%d, rhythm=%d notes — merging", len(lead_events), len(rhythm_events))
                all_sections = _build_sections(note_events, bpm, duration_ms)
                guitars = [
                    {"name": "Guitar", "sections": _assign_lyrics(all_sections, lyrics_sections)},
                ]
            tab_data = {
                "tuning": _TUNING_NAMES,
                "bpm": round(bpm, 1),
                "lyrics_sections": lyrics_sections,
                "guitars": guitars,
                "source": "ml",
            }

            # Persist guitar stem as WAV so users can download it later.
            # Demucs already produced a WAV — just copy it into the audio store.
            if tab_gen_id:
                try:
                    _AUDIO_STORE.mkdir(parents=True, exist_ok=True)
                    out_wav = _AUDIO_STORE / f"{tab_gen_id}.wav"
                    shutil.copyfile(guitar, out_wav)
                    logger.info("Guitar stem saved: %s", out_wav)
                except Exception:
                    logger.warning("Failed to save guitar stem WAV", exc_info=True)

            return {"has_guitar": True, "tab_data": tab_data, "source": "ml"}

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
            pass  # non-critical; don't abort the pipeline over a step update

    try:
        result = await asyncio.to_thread(_run_pipeline_sync, title, artist, duration_ms, on_step, tab_gen_id)

        async with Session() as session:
            job = await _get_job(session)
            if job is None:
                return

            job.status = "done"
            job.completed_at = datetime.now(timezone.utc)
            job.tab_data = result["tab_data"]
            job.source = result.get("source", "ml")

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

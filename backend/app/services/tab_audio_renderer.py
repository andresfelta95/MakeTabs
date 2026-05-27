"""
Render a MIDI byte-string to a WAV file using FluidSynth + a GM soundfont.
The result is what users download from `/tabs/{job_id}/audio`.

WAV (lossless) is the on-disk format — downstream projects can encode to MP3
themselves if they want compression. Both `fluidsynth` and a `.sf2` soundfont
are provided by the Docker image (see backend/Dockerfile). On any failure we
just skip WAV generation — the tab itself is still valid.
"""

from __future__ import annotations

import logging
import os
import subprocess
from pathlib import Path

logger = logging.getLogger(__name__)

# Default soundfont path inside the container. Override with env var if needed.
_SOUNDFONT = os.environ.get("MAKETABS_SOUNDFONT", "/usr/share/sounds/sf2/FluidR3_GM.sf2")


def render_midi_to_wav(midi_bytes: bytes, output_wav: Path) -> bool:
    """Synthesize MIDI bytes → WAV at `output_wav`. Returns True on success."""
    if not Path(_SOUNDFONT).exists():
        logger.warning("Soundfont not found at %s — skipping WAV synthesis", _SOUNDFONT)
        return False

    output_wav.parent.mkdir(parents=True, exist_ok=True)
    midi_path = output_wav.with_suffix(".mid.tmp")
    midi_path.write_bytes(midi_bytes)
    try:
        # FluidSynth: render MIDI to WAV (no audio output device, no ffmpeg re-encode).
        fs_cmd = [
            "fluidsynth", "-ni", "-g", "0.9", "-r", "44100",
            "-F", str(output_wav), _SOUNDFONT, str(midi_path),
        ]
        try:
            result = subprocess.run(fs_cmd, capture_output=True, timeout=300)
        except (FileNotFoundError, subprocess.TimeoutExpired) as e:
            logger.warning("fluidsynth failed: %s", e)
            return False
        if result.returncode != 0 or not output_wav.exists() or output_wav.stat().st_size < 1024:
            logger.warning("fluidsynth produced no audio: %s", result.stderr[-500:].decode(errors="ignore"))
            return False
    finally:
        midi_path.unlink(missing_ok=True)
    return True

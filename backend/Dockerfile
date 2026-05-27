FROM python:3.11-slim

# ffmpeg: yt-dlp + demucs + MP3 encoding
# fluidsynth + soundfont: synthesize MIDI to WAV in the Songsterr path
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    fluidsynth \
    fluid-soundfont-gm \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .

# Install PyTorch with CUDA 12.1 support first so demucs and basic-pitch
# pick up the GPU build instead of the CPU wheel pulled by their own deps
RUN pip install --no-cache-dir torch torchaudio --index-url https://download.pytorch.org/whl/cu121

RUN pip install --no-cache-dir -r requirements.txt

COPY . .

COPY start.sh /start.sh
RUN chmod +x /start.sh

EXPOSE 8000
CMD ["/start.sh"]

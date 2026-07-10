import { useEffect, useRef, useState } from "react";

interface BackendAudioPlayerProps {
  jobId: string;
}

function fmt(secs: number): string {
  const s = Math.max(0, Math.floor(secs));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * Plays the backend-rendered audio (FluidSynth-synthesized WAV from MIDI of
 * all non-vocal tracks). Sits next to the oscillator-based TabPlayer so users
 * can A/B between the two sounds.
 */
export default function BackendAudioPlayer({ jobId }: BackendAudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    const audio = new Audio(`/api/tabs/${jobId}/audio`);
    audio.preload = "metadata";
    audioRef.current = audio;

    const onLoaded = () => {
      setDuration(audio.duration || 0);
      setLoading(false);
    };
    const onTime = () => setProgress(audio.currentTime);
    const onEnd = () => {
      setIsPlaying(false);
      setProgress(0);
      audio.currentTime = 0;
    };
    const onError = () => {
      setLoading(false);
      setAudioError("Audio del backend no disponible");
    };

    audio.addEventListener("loadedmetadata", onLoaded);
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("ended", onEnd);
    audio.addEventListener("error", onError);

    return () => {
      audio.pause();
      audio.removeEventListener("loadedmetadata", onLoaded);
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("ended", onEnd);
      audio.removeEventListener("error", onError);
      audioRef.current = null;
    };
  }, [jobId]);

  function handlePlayPause() {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      audio.play().then(() => setIsPlaying(true)).catch(() => {
        setAudioError("El navegador bloqueó el audio");
      });
    }
  }

  function handleStop() {
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    audio.currentTime = 0;
    setIsPlaying(false);
    setProgress(0);
  }

  function handleSeek(e: React.MouseEvent<HTMLDivElement>) {
    const audio = audioRef.current;
    if (!audio || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    audio.currentTime = Math.max(0, Math.min(duration, ratio * duration));
    setProgress(audio.currentTime);
  }

  async function handleDownload() {
    if (downloading) return;
    setDownloading(true);
    try {
      const res = await fetch(`/api/tabs/${jobId}/audio`, { credentials: "include" });
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const blob = await res.blob();
      const disposition = res.headers.get("content-disposition") ?? "";
      const nameMatch = disposition.match(/filename="?([^"]+)"?/);
      const filename = nameMatch ? nameMatch[1] : "audio.wav";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("Backend audio download failed", e);
      setAudioError("Error descargando audio");
    } finally {
      setDownloading(false);
    }
  }

  const pct = duration > 0 ? (progress / duration) * 100 : 0;

  return (
    <div className="bg-card border border-blue-400/30 rounded-xl p-4 space-y-2">
      <div className="flex items-center gap-3">
        <button
          onClick={handlePlayPause}
          disabled={loading || !!audioError}
          title={isPlaying ? "Pause" : "Play"}
          className="w-10 h-10 rounded-full bg-blue-400 text-black flex items-center justify-center
                     hover:scale-105 active:scale-95 transition-transform flex-shrink-0
                     disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {isPlaying ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <rect x="5" y="3" width="5" height="18" rx="1" />
              <rect x="14" y="3" width="5" height="18" rx="1" />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="5,3 20,12 5,21" />
            </svg>
          )}
        </button>

        {progress > 0 && (
          <button
            onClick={handleStop}
            title="Stop"
            className="w-8 h-8 rounded-full border border-theme text-secondary
                       hover:text-primary flex items-center justify-center flex-shrink-0 transition-colors"
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
              <rect x="3" y="3" width="18" height="18" rx="2" />
            </svg>
          </button>
        )}

        <span className="text-xs text-secondary font-mono w-10 text-right">{fmt(progress)}</span>

        <div
          onClick={handleSeek}
          className="flex-1 h-1.5 bg-elevated rounded-full overflow-hidden cursor-pointer"
        >
          <div
            className="h-full bg-blue-400 rounded-full"
            style={{ width: `${pct}%`, transition: "none" }}
          />
        </div>

        <span className="text-xs text-secondary font-mono w-10">{fmt(duration)}</span>

        <button
          onClick={handleDownload}
          disabled={downloading || loading || !!audioError}
          title="Download backend audio (FluidSynth + soundfont)"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold
                     border border-blue-400/40 text-blue-400 hover:bg-blue-400/10
                     disabled:opacity-50 disabled:cursor-wait transition-colors flex-shrink-0"
        >
          {downloading ? (
            <svg className="animate-spin w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" strokeOpacity="0.3" />
              <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
            </svg>
          ) : (
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3v13M5 16l7 7 7-7" />
              <line x1="3" y1="23" x2="21" y2="23" />
            </svg>
          )}
          {downloading ? "Fetching…" : "WAV"}
        </button>
      </div>

      <div className="flex items-center gap-1 text-secondary">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="flex-shrink-0">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
        <p className="text-xs">
          {loading
            ? "Cargando audio backend (FluidSynth)…"
            : "Audio sintetizado en el backend (FluidSynth + soundfont GM, todas las pistas)."}
        </p>
        {audioError && <span className="text-xs text-red-400 ml-2">{audioError}</span>}
      </div>
    </div>
  );
}

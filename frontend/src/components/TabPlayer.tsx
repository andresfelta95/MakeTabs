import { useState, useRef, useEffect, useMemo } from "react";
import type { GuitarTab } from "../types";

const OPEN_MIDI: Record<number, number> = { 1: 40, 2: 45, 3: 50, 4: 55, 5: 59, 6: 64 };
const BEATS_PER_MEASURE = 16;
const SCHEDULE_AHEAD = 0.5;
const TICK_MS = 150;

interface Note {
  time: number;
  midi: number;
}

function buildTimeline(guitar: GuitarTab, bpm: number): { notes: Note[]; total: number } {
  const quarterDur = 60 / Math.max(bpm, 20);
  const measureDur = 4 * quarterDur;
  const beatDur = measureDur / BEATS_PER_MEASURE;
  const notes: Note[] = [];
  let cursor = 0;

  for (const section of guitar.sections) {
    for (let mi = 0; mi < section.measures.length; mi++) {
      for (const n of section.measures[mi].notes) {
        const open = OPEN_MIDI[n.string];
        if (open !== undefined) {
          notes.push({ time: cursor + mi * measureDur + (n.beat ?? 0) * beatDur, midi: open + n.fret });
        }
      }
    }
    cursor += section.measures.length * measureDur;
  }

  notes.sort((a, b) => a.time - b.time);
  return { notes, total: cursor };
}

function fmt(secs: number): string {
  const s = Math.max(0, Math.floor(secs));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

interface TabPlayerProps {
  guitar: GuitarTab;
  bpm: number;
}

type State = "idle" | "playing" | "paused";

export default function TabPlayer({ guitar, bpm }: TabPlayerProps) {
  const [status, setStatus]     = useState<State>("idle");
  const [progress, setProgress] = useState(0);
  const [audioError, setAudioError] = useState<string | null>(null);

  const acRef          = useRef<AudioContext | null>(null);
  const songStartRef   = useRef(0);
  const offsetRef      = useRef(0);
  const rafRef         = useRef(0);
  const timerRef       = useRef(0);
  const noteIdxRef     = useRef(0);
  const liveNodesRef   = useRef<OscillatorNode[]>([]); // prevent GC of scheduled nodes

  const { notes, total } = useMemo(() => buildTimeline(guitar, bpm), [guitar, bpm]);

  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      clearTimeout(timerRef.current);
      acRef.current?.close();
      liveNodesRef.current = [];
    };
  }, [guitar, bpm]);

  function teardown() {
    cancelAnimationFrame(rafRef.current);
    clearTimeout(timerRef.current);
    acRef.current?.close();
    acRef.current = null;
    liveNodesRef.current = [];
  }

  function playNote(ac: AudioContext, midi: number, when: number) {
    const freq = 440 * Math.pow(2, (midi - 69) / 12);
    const osc  = ac.createOscillator();
    const gain = ac.createGain();

    osc.connect(gain);
    gain.connect(ac.destination);

    osc.type = "sawtooth";
    osc.frequency.value = freq;
    gain.gain.value = 0.4; // constant gain — avoids automation timing bugs on mobile

    osc.start(when);
    osc.stop(when + 0.3);

    liveNodesRef.current.push(osc);
    osc.onended = () => {
      liveNodesRef.current = liveNodesRef.current.filter(n => n !== osc);
    };
  }


function scheduleChunk(ac: AudioContext) {
    const now = ac.currentTime;
    const horizonSong = (now + SCHEDULE_AHEAD) - songStartRef.current + offsetRef.current;

    while (noteIdxRef.current < notes.length) {
      const { time, midi } = notes[noteIdxRef.current];
      if (time > horizonSong) break;
      const when = songStartRef.current + (time - offsetRef.current);
      if (when > now - 0.01) {
        playNote(ac, midi, Math.max(when, now + 0.005));
      }
      noteIdxRef.current++;
    }

    if (noteIdxRef.current < notes.length) {
      timerRef.current = window.setTimeout(() => {
        if (acRef.current === ac) scheduleChunk(ac);
      }, TICK_MS);
    }
  }

  function startProgressLoop(ac: AudioContext) {
    const tick = () => {
      const songPos = (ac.currentTime - songStartRef.current) + offsetRef.current;
      const p = Math.min(songPos / total, 1);
      setProgress(p);
      if (p < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        teardown();
        offsetRef.current = 0;
        setStatus("idle");
        setProgress(0);
      }
    };
    rafRef.current = requestAnimationFrame(tick);
  }

  function handlePlay() {
    if (status === "playing") return;
    if (notes.length === 0) return;
    setAudioError(null);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const AC = (window as any).AudioContext ?? (window as any).webkitAudioContext;
    if (!AC) { setAudioError("Web Audio API no soportado"); return; }

    let ac: AudioContext;
    try {
      ac = new AC();
    } catch (e) {
      setAudioError("No se pudo crear AudioContext");
      return;
    }
    acRef.current = ac;

    // Wait for context to be running before scheduling — required on mobile Chrome
    ac.resume().then(() => {
      // Confirm this play session is still active (user might have stopped)
      if (acRef.current !== ac) return;

      const now = ac.currentTime;
      songStartRef.current = now + 0.1; // 100ms buffer so first notes aren't clipped
      noteIdxRef.current   = notes.findIndex(n => n.time >= offsetRef.current);
      if (noteIdxRef.current === -1) noteIdxRef.current = notes.length;

      scheduleChunk(ac);
      setStatus("playing");
      startProgressLoop(ac);
    }).catch(() => {
      setAudioError("El navegador bloqueó el audio");
      acRef.current = null;
    });
  }

  function handlePause() {
    if (!acRef.current) return;
    const songPos = (acRef.current.currentTime - songStartRef.current) + offsetRef.current;
    offsetRef.current = Math.max(0, songPos);
    teardown();
    cancelAnimationFrame(rafRef.current);
    setStatus("paused");
  }

  function handleStop() {
    teardown();
    cancelAnimationFrame(rafRef.current);
    offsetRef.current  = 0;
    noteIdxRef.current = 0;
    setStatus("idle");
    setProgress(0);
  }

  const elapsed = progress * total;

  return (
    <div className="bg-card border border-theme rounded-xl p-4 space-y-2">
      <div className="flex items-center gap-3">
        <button
          onClick={status === "playing" ? handlePause : handlePlay}
          title={status === "playing" ? "Pause" : "Play"}
          className="w-10 h-10 rounded-full bg-accent text-black flex items-center justify-center
                     hover:scale-105 active:scale-95 transition-transform flex-shrink-0"
        >
          {status === "playing" ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <rect x="5" y="3" width="5" height="18" rx="1"/>
              <rect x="14" y="3" width="5" height="18" rx="1"/>
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="5,3 20,12 5,21"/>
            </svg>
          )}
        </button>

        {status !== "idle" && (
          <button
            onClick={handleStop}
            title="Stop"
            className="w-8 h-8 rounded-full border border-theme text-secondary
                       hover:text-primary flex items-center justify-center flex-shrink-0 transition-colors"
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
              <rect x="3" y="3" width="18" height="18" rx="2"/>
            </svg>
          </button>
        )}

        <span className="text-xs text-secondary font-mono w-10 text-right">{fmt(elapsed)}</span>

        <div className="flex-1 h-1.5 bg-elevated rounded-full overflow-hidden">
          <div
            className="h-full bg-accent rounded-full"
            style={{ width: `${progress * 100}%`, transition: "none" }}
          />
        </div>

        <span className="text-xs text-secondary font-mono w-10">{fmt(total)}</span>
      </div>

      <div className="flex items-center gap-1 text-secondary">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="flex-shrink-0">
          <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <p className="text-xs">On mobile, make sure silent mode is off to hear audio.</p>
        {audioError && <span className="text-xs text-red-400 ml-2">{audioError}</span>}
      </div>
    </div>
  );
}

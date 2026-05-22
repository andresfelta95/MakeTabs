import { useState, useRef, useEffect, useMemo } from "react";
import type { ChiptuneData, ChiptuneTonalTrack, DrumEvent } from "../types";

const BEATS_PER_MEASURE = 8;
const SCHEDULE_AHEAD = 0.4;
const TICK_MS = 120;

interface ScheduledNote {
  time: number;
  midi: number;
  waveform: OscillatorType;
  duration: number;
  gain: number;
}

interface ScheduledDrum {
  time: number;
  type: "kick" | "snare" | "hihat";
}

function buildTonalTimeline(
  track: ChiptuneTonalTrack,
  bpm: number,
): ScheduledNote[] {
  const quarterDur = 60 / Math.max(bpm, 20);
  const measureDur = 4 * quarterDur;
  const beatDur = measureDur / BEATS_PER_MEASURE;
  const noteDur = beatDur * 1.8;
  const osc = track.waveform as OscillatorType;
  const gainLevel = osc === "triangle" ? 0.35 : 0.25;

  const notes: ScheduledNote[] = [];
  let cursor = 0;

  for (const section of track.sections) {
    for (let mi = 0; mi < section.measures.length; mi++) {
      for (const n of section.measures[mi].notes) {
        notes.push({
          time: cursor + mi * measureDur + (n.beat ?? 0) * beatDur,
          midi: n.pitch,
          waveform: osc,
          duration: noteDur,
          gain: gainLevel,
        });
      }
    }
    cursor += section.measures.length * measureDur;
  }

  notes.sort((a, b) => a.time - b.time);
  return notes;
}

function buildDrumTimeline(
  patterns: DrumEvent[],
  bpm: number,
): ScheduledDrum[] {
  const quarterDur = 60 / Math.max(bpm, 20);
  const measureDur = 4 * quarterDur;
  const beatDur = measureDur / BEATS_PER_MEASURE;

  return patterns
    .map(p => ({ time: p.measure * measureDur + p.beat * beatDur, type: p.type }))
    .sort((a, b) => a.time - b.time);
}

function midiToHz(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function playTone(ac: AudioContext, note: ScheduledNote, when: number) {
  const osc  = ac.createOscillator();
  const gain = ac.createGain();
  osc.connect(gain);
  gain.connect(ac.destination);
  osc.type = note.waveform;
  osc.frequency.value = midiToHz(note.midi);
  gain.gain.value = note.gain;
  osc.start(when);
  osc.stop(when + note.duration);
}

function playDrum(ac: AudioContext, type: "kick" | "snare" | "hihat", when: number) {
  const gain = ac.createGain();
  gain.connect(ac.destination);

  if (type === "kick") {
    const osc = ac.createOscillator();
    osc.connect(gain);
    osc.type = "sine";
    osc.frequency.setValueAtTime(150, when);
    osc.frequency.exponentialRampToValueAtTime(0.01, when + 0.4);
    gain.gain.setValueAtTime(0.8, when);
    gain.gain.exponentialRampToValueAtTime(0.001, when + 0.4);
    osc.start(when);
    osc.stop(when + 0.4);
  } else if (type === "snare") {
    const noise = ac.createOscillator();
    noise.connect(gain);
    noise.type = "sawtooth";
    noise.frequency.value = 100;
    gain.gain.setValueAtTime(0.15, when);
    gain.gain.exponentialRampToValueAtTime(0.001, when + 0.15);
    noise.start(when);
    noise.stop(when + 0.15);
  } else {
    // hi-hat: short high-freq square burst
    const hh = ac.createOscillator();
    hh.connect(gain);
    hh.type = "square";
    hh.frequency.value = 8000;
    gain.gain.setValueAtTime(0.05, when);
    gain.gain.exponentialRampToValueAtTime(0.001, when + 0.05);
    hh.start(when);
    hh.stop(when + 0.05);
  }
}

function fmt(secs: number): string {
  const s = Math.max(0, Math.floor(secs));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

interface ChiptunePlayerProps {
  data: ChiptuneData;
}

type State = "idle" | "playing" | "paused";

export default function ChiptunePlayer({ data }: ChiptunePlayerProps) {
  const [status, setStatus]     = useState<State>("idle");
  const [progress, setProgress] = useState(0);
  const [muted, setMuted]       = useState<Record<string, boolean>>({
    melody: false, bass: false, drums: false,
  });

  const acRef        = useRef<AudioContext | null>(null);
  const songStartRef = useRef(0);
  const offsetRef    = useRef(0);
  const rafRef       = useRef(0);
  const timerRef     = useRef(0);
  const mIdxRef      = useRef(0); // melody index
  const bIdxRef      = useRef(0); // bass index
  const dIdxRef      = useRef(0); // drums index

  const { melody, bass, drums, total } = useMemo(() => {
    const m = buildTonalTimeline(data.tracks.melody, data.bpm);
    const b = buildTonalTimeline(data.tracks.bass, data.bpm);
    const d = buildDrumTimeline(data.tracks.drums.patterns, data.bpm);
    const all = [...m.map(n => n.time), ...b.map(n => n.time), ...d.map(n => n.time)];
    const t = all.length > 0 ? Math.max(...all) + 2 : 30;
    return { melody: m, bass: b, drums: d, total: t };
  }, [data]);

  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      clearTimeout(timerRef.current);
      acRef.current?.close();
    };
  }, [data]);

  function teardown() {
    cancelAnimationFrame(rafRef.current);
    clearTimeout(timerRef.current);
    acRef.current?.close();
    acRef.current = null;
  }

  function scheduleChunk(ac: AudioContext) {
    const now = ac.currentTime;
    const horizon = now + SCHEDULE_AHEAD;
    const songNow = now - songStartRef.current + offsetRef.current;
    const songHorizon = songNow + SCHEDULE_AHEAD;

    if (!muted.melody) {
      while (mIdxRef.current < melody.length && melody[mIdxRef.current].time <= songHorizon) {
        const note = melody[mIdxRef.current];
        const when = Math.max(songStartRef.current + (note.time - offsetRef.current), now + 0.005);
        if (when < horizon + 0.1) playTone(ac, note, when);
        mIdxRef.current++;
      }
    } else {
      while (mIdxRef.current < melody.length && melody[mIdxRef.current].time <= songHorizon) mIdxRef.current++;
    }

    if (!muted.bass) {
      while (bIdxRef.current < bass.length && bass[bIdxRef.current].time <= songHorizon) {
        const note = bass[bIdxRef.current];
        const when = Math.max(songStartRef.current + (note.time - offsetRef.current), now + 0.005);
        if (when < horizon + 0.1) playTone(ac, note, when);
        bIdxRef.current++;
      }
    } else {
      while (bIdxRef.current < bass.length && bass[bIdxRef.current].time <= songHorizon) bIdxRef.current++;
    }

    if (!muted.drums) {
      while (dIdxRef.current < drums.length && drums[dIdxRef.current].time <= songHorizon) {
        const drum = drums[dIdxRef.current];
        const when = Math.max(songStartRef.current + (drum.time - offsetRef.current), now + 0.005);
        if (when < horizon + 0.1) playDrum(ac, drum.type, when);
        dIdxRef.current++;
      }
    } else {
      while (dIdxRef.current < drums.length && drums[dIdxRef.current].time <= songHorizon) dIdxRef.current++;
    }

    const anyLeft = mIdxRef.current < melody.length
      || bIdxRef.current < bass.length
      || dIdxRef.current < drums.length;

    if (anyLeft) {
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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const AC = (window as any).AudioContext ?? (window as any).webkitAudioContext;
    const ac: AudioContext = new AC();
    ac.resume();
    acRef.current = ac;

    const now = ac.currentTime + 0.05;
    songStartRef.current = now;

    // Reset indices to offset position
    const offset = offsetRef.current;
    mIdxRef.current = melody.findIndex(n => n.time >= offset);
    if (mIdxRef.current === -1) mIdxRef.current = melody.length;
    bIdxRef.current = bass.findIndex(n => n.time >= offset);
    if (bIdxRef.current === -1) bIdxRef.current = bass.length;
    dIdxRef.current = drums.findIndex(n => n.time >= offset);
    if (dIdxRef.current === -1) dIdxRef.current = drums.length;

    scheduleChunk(ac);
    setStatus("playing");
    startProgressLoop(ac);
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
    offsetRef.current = 0;
    setStatus("idle");
    setProgress(0);
  }

  function toggleMute(track: string) {
    setMuted(prev => ({ ...prev, [track]: !prev[track] }));
  }

  const elapsed = progress * total;
  const trackKeys = ["melody", "bass", "drums"] as const;
  const trackLabels = { melody: "Melody", bass: "Bass", drums: "Drums" };

  return (
    <div className="bg-card border border-theme rounded-xl p-4 space-y-3">
      {/* Transport controls */}
      <div className="flex items-center gap-3">
        <button
          onClick={status === "playing" ? handlePause : handlePlay}
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
          <div className="h-full bg-accent rounded-full" style={{ width: `${progress * 100}%`, transition: "none" }} />
        </div>
        <span className="text-xs text-secondary font-mono w-10">{fmt(total)}</span>
      </div>

      {/* Track mute toggles */}
      <div className="flex items-center gap-2 flex-wrap">
        {trackKeys.map(key => (
          <button
            key={key}
            onClick={() => toggleMute(key)}
            className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors
              ${muted[key]
                ? "border border-theme text-secondary opacity-50"
                : "bg-accent/20 text-accent border border-accent/40"
              }`}
          >
            {trackLabels[key]}
          </button>
        ))}
        <span className="text-xs text-secondary ml-1">tap to mute</span>
      </div>

      <p className="text-xs text-secondary flex items-center gap-1">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        On mobile, make sure silent mode is off to hear audio.
      </p>
    </div>
  );
}

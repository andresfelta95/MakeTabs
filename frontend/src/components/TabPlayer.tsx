import { useState, useRef, useEffect, useMemo } from "react";
import type { TabData, AccompanimentTrack } from "../types";

const OPEN_MIDI: Record<number, number> = { 1: 40, 2: 45, 3: 50, 4: 55, 5: 59, 6: 64 };
const BEATS_PER_MEASURE = 16;
const SCHEDULE_AHEAD = 0.5;
const TICK_MS = 150;

type NoteKind = "guitar" | "bass" | "piano" | "drums" | "other";

interface Note {
  time: number; // seconds
  midi: number;
  dur: number; // seconds
  kind: NoteKind;
}

/** Flatten every guitar's notes + accompaniment notes into one global timeline. */
function buildCombinedTimeline(tab: TabData): { notes: Note[]; total: number; voices: number } {
  const guitars = tab.guitars ?? (tab.sections ? [{ name: "Guitar", sections: tab.sections }] : []);
  const quarterDur = 60 / Math.max(tab.bpm, 20);
  const measureDur = 4 * quarterDur;
  const beatDur = measureDur / BEATS_PER_MEASURE;
  const notes: Note[] = [];
  let totalSongDur = 0;

  // 1. Guitar tabs — derived from the visible string/fret/beat grid.
  for (const g of guitars) {
    let cursor = 0;
    for (const section of g.sections) {
      for (let mi = 0; mi < section.measures.length; mi++) {
        for (const n of section.measures[mi].notes) {
          const open = OPEN_MIDI[n.string];
          if (open === undefined) continue;
          notes.push({
            time: cursor + mi * measureDur + (n.beat ?? 0) * beatDur,
            midi: open + n.fret,
            dur: Math.max(0.08, (n.duration ?? 1) * beatDur * 0.9),
            kind: "guitar",
          });
        }
      }
      cursor += section.measures.length * measureDur;
    }
    if (cursor > totalSongDur) totalSongDur = cursor;
  }

  // 2. Accompaniment (bass/piano/drums) — backend pre-computes these in
  //    absolute time so we can layer them in without quantizing.
  const accompaniment = tab.accompaniment ?? [];
  for (const acc of accompaniment) {
    for (const n of acc.notes) {
      notes.push({
        time: n.t,
        midi: n.p,
        dur: Math.max(0.05, n.d),
        kind: acc.kind as NoteKind,
      });
      if (n.t + n.d > totalSongDur) totalSongDur = n.t + n.d;
    }
  }

  notes.sort((a, b) => a.time - b.time);
  return { notes, total: totalSongDur, voices: Math.max(1, guitars.length + accompaniment.length) };
}

function fmt(secs: number): string {
  const s = Math.max(0, Math.floor(secs));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Encode an AudioBuffer as 16-bit PCM little-endian WAV. */
function audioBufferToWav(buf: AudioBuffer): Blob {
  const numCh = buf.numberOfChannels;
  const sr = buf.sampleRate;
  const samples = buf.length;
  const dataLen = samples * numCh * 2;
  const arr = new ArrayBuffer(44 + dataLen);
  const view = new DataView(arr);
  const writeStr = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + dataLen, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numCh, true);
  view.setUint32(24, sr, true);
  view.setUint32(28, sr * numCh * 2, true);
  view.setUint16(32, numCh * 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, dataLen, true);
  const channels: Float32Array[] = [];
  for (let c = 0; c < numCh; c++) channels.push(buf.getChannelData(c));
  let off = 44;
  for (let i = 0; i < samples; i++) {
    for (let c = 0; c < numCh; c++) {
      let s = Math.max(-1, Math.min(1, channels[c][i]));
      s = s < 0 ? s * 0x8000 : s * 0x7fff;
      view.setInt16(off, s, true);
      off += 2;
    }
  }
  return new Blob([arr], { type: "audio/wav" });
}

const VOICE_GAIN: Record<NoteKind, number> = {
  guitar: 0.20,
  bass:   0.28,
  piano:  0.18,
  drums:  0.45,
  other:  0.15,
};

/** Build a short noise buffer (~1s) we can reuse for every drum hit. */
function makeNoiseBuffer(ac: BaseAudioContext): AudioBuffer {
  const sr = ac.sampleRate;
  const buf = ac.createBuffer(1, sr, sr);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

/** Schedule a single drum hit (filtered noise burst) based on GM percussion pitch. */
function scheduleDrum(
  ac: BaseAudioContext,
  dest: AudioNode,
  noiseBuf: AudioBuffer,
  pitch: number,
  startTime: number,
  voiceGain: number,
) {
  // Map GM percussion → filter profile.
  let cutoff = 4000;
  let q = 1.0;
  let filterType: BiquadFilterType = "bandpass";
  let dur = 0.12;
  if (pitch >= 35 && pitch <= 36) { // kick
    cutoff = 120; q = 1.5; filterType = "lowpass"; dur = 0.18;
  } else if (pitch === 38 || pitch === 40) { // snare
    cutoff = 1800; q = 1.2; filterType = "bandpass"; dur = 0.14;
  } else if (pitch === 42 || pitch === 44 || pitch === 46) { // hi-hat
    cutoff = 9000; q = 0.8; filterType = "highpass"; dur = 0.06;
  } else if (pitch >= 41 && pitch <= 50) { // toms
    cutoff = 400; q = 1.3; filterType = "bandpass"; dur = 0.16;
  } else if (pitch >= 49 && pitch <= 57) { // cymbals
    cutoff = 7000; q = 0.6; filterType = "highpass"; dur = 0.25;
  }

  const src = ac.createBufferSource();
  src.buffer = noiseBuf;
  const filter = ac.createBiquadFilter();
  filter.type = filterType;
  filter.frequency.value = cutoff;
  filter.Q.value = q;
  const gain = ac.createGain();
  src.connect(filter).connect(gain).connect(dest);

  gain.gain.setValueAtTime(0, startTime);
  gain.gain.linearRampToValueAtTime(voiceGain, startTime + 0.002);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + dur);

  src.start(startTime);
  src.stop(startTime + dur + 0.02);
}

/** Schedule a single pitched note (oscillator) with kind-specific timbre. */
function schedulePitched(
  ac: BaseAudioContext,
  dest: AudioNode,
  kind: NoteKind,
  midi: number,
  startTime: number,
  duration: number,
  voiceGain: number,
) {
  const freq = 440 * Math.pow(2, (midi - 69) / 12);
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.connect(gain).connect(dest);

  if (kind === "bass") osc.type = "triangle";
  else if (kind === "piano") osc.type = "triangle";
  else osc.type = "sawtooth"; // guitar / other

  osc.frequency.value = freq;

  const attack = kind === "piano" ? 0.005 : 0.005;
  const release = kind === "piano" ? Math.min(0.4, duration * 0.5) : 0.02;

  gain.gain.setValueAtTime(0, startTime);
  gain.gain.linearRampToValueAtTime(voiceGain, startTime + attack);
  gain.gain.setValueAtTime(voiceGain, startTime + duration - release);
  gain.gain.linearRampToValueAtTime(0, startTime + duration);

  osc.start(startTime);
  osc.stop(startTime + duration + 0.01);
}

/** Schedule every note from the timeline into a destination, applying a global gain. */
function scheduleAll(
  ac: BaseAudioContext,
  dest: AudioNode,
  notes: Note[],
  startTime: number,
  voices: number,
  noiseBuf: AudioBuffer,
) {
  const scale = 1 / Math.max(1, Math.sqrt(voices));
  for (const n of notes) {
    const t = startTime + n.time;
    const g = (VOICE_GAIN[n.kind] ?? 0.2) * scale;
    if (n.kind === "drums") {
      scheduleDrum(ac, dest, noiseBuf, n.midi, t, g);
    } else {
      schedulePitched(ac, dest, n.kind, n.midi, t, n.dur, g);
    }
  }
}

interface TabPlayerProps {
  tab: TabData;
  songTitle?: string;
}

type State = "idle" | "playing" | "paused";

export default function TabPlayer({ tab, songTitle }: TabPlayerProps) {
  const [status, setStatus] = useState<State>("idle");
  const [progress, setProgress] = useState(0);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [rendering, setRendering] = useState(false);

  const acRef = useRef<AudioContext | null>(null);
  const noiseRef = useRef<AudioBuffer | null>(null);
  const songStartRef = useRef(0);
  const offsetRef = useRef(0);
  const rafRef = useRef(0);
  const timerRef = useRef(0);
  const noteIdxRef = useRef(0);

  const { notes, total, voices } = useMemo(() => buildCombinedTimeline(tab), [tab]);

  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      clearTimeout(timerRef.current);
      acRef.current?.close();
    };
  }, [tab]);

  function teardown() {
    cancelAnimationFrame(rafRef.current);
    clearTimeout(timerRef.current);
    acRef.current?.close();
    acRef.current = null;
    noiseRef.current = null;
  }

  function scheduleChunk(ac: AudioContext) {
    const now = ac.currentTime;
    const horizonSong = now + SCHEDULE_AHEAD - songStartRef.current + offsetRef.current;
    const scale = 1 / Math.max(1, Math.sqrt(voices));

    while (noteIdxRef.current < notes.length) {
      const n = notes[noteIdxRef.current];
      if (n.time > horizonSong) break;
      const when = songStartRef.current + (n.time - offsetRef.current);
      if (when > now - 0.01) {
        const t = Math.max(when, now + 0.005);
        const g = (VOICE_GAIN[n.kind] ?? 0.2) * scale;
        if (n.kind === "drums" && noiseRef.current) {
          scheduleDrum(ac, ac.destination, noiseRef.current, n.midi, t, g);
        } else {
          schedulePitched(ac, ac.destination, n.kind, n.midi, t, n.dur, g);
        }
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
      const songPos = ac.currentTime - songStartRef.current + offsetRef.current;
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
    if (status === "playing" || notes.length === 0) return;
    setAudioError(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const AC = (window as any).AudioContext ?? (window as any).webkitAudioContext;
    if (!AC) {
      setAudioError("Web Audio no soportado");
      return;
    }
    let ac: AudioContext;
    try {
      ac = new AC();
    } catch {
      setAudioError("No se pudo crear AudioContext");
      return;
    }
    acRef.current = ac;
    noiseRef.current = makeNoiseBuffer(ac);
    ac.resume().then(() => {
      if (acRef.current !== ac) return;
      const now = ac.currentTime;
      songStartRef.current = now + 0.1;
      noteIdxRef.current = notes.findIndex((n) => n.time >= offsetRef.current);
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
    const songPos = acRef.current.currentTime - songStartRef.current + offsetRef.current;
    offsetRef.current = Math.max(0, songPos);
    teardown();
    cancelAnimationFrame(rafRef.current);
    setStatus("paused");
  }

  function handleStop() {
    teardown();
    cancelAnimationFrame(rafRef.current);
    offsetRef.current = 0;
    noteIdxRef.current = 0;
    setStatus("idle");
    setProgress(0);
  }

  async function handleDownload() {
    if (rendering || notes.length === 0) return;
    setRendering(true);
    setAudioError(null);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const OAC: typeof OfflineAudioContext = (window as any).OfflineAudioContext
        ?? (window as any).webkitOfflineAudioContext;
      if (!OAC) {
        setAudioError("Offline rendering no soportado");
        return;
      }
      const sampleRate = 44100;
      const padding = 0.5;
      const length = Math.ceil((total + padding) * sampleRate);
      const oac = new OAC(2, length, sampleRate);
      const noise = makeNoiseBuffer(oac);
      scheduleAll(oac, oac.destination, notes, 0, voices, noise);
      const rendered = await oac.startRendering();
      const blob = audioBufferToWav(rendered);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const safe = (songTitle ?? "tab").replace(/[^a-z0-9_\- ]/gi, "_");
      a.download = `${safe}_synth.wav`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("Offline render failed", e);
      setAudioError("Error renderizando audio");
    } finally {
      setRendering(false);
    }
  }

  const elapsed = progress * total;
  const accCount = tab.accompaniment?.length ?? 0;
  const guitarCount = tab.guitars?.length ?? (tab.sections ? 1 : 0);

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
              <rect x="5" y="3" width="5" height="18" rx="1" />
              <rect x="14" y="3" width="5" height="18" rx="1" />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="5,3 20,12 5,21" />
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
              <rect x="3" y="3" width="18" height="18" rx="2" />
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

        <button
          onClick={handleDownload}
          disabled={rendering || notes.length === 0}
          title="Download synthesized audio (oscillator mix) as WAV"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold
                     border border-green-400/40 text-green-400 hover:bg-green-400/10
                     disabled:opacity-50 disabled:cursor-wait transition-colors flex-shrink-0"
        >
          {rendering ? (
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
          {rendering ? "Rendering…" : "WAV"}
        </button>
      </div>

      <div className="flex items-center gap-1 text-secondary">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="flex-shrink-0">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
        <p className="text-xs">
          Mezcla en vivo: {guitarCount} guitarra{guitarCount === 1 ? "" : "s"}
          {accCount > 0 && ` + ${(tab.accompaniment ?? []).map((a: AccompanimentTrack) => a.kind).join(" + ")}`}
          . En mobile activá el sonido.
        </p>
        {audioError && <span className="text-xs text-red-400 ml-2">{audioError}</span>}
      </div>
    </div>
  );
}

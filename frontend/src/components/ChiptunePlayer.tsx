import { useState, useRef, useEffect, useMemo } from "react";
import type { ChiptuneData, ChiptuneTonalTrack, DrumEvent } from "../types";

// Fallback for chiptune jobs generated before slots_per_measure was stamped
// into the data — those used a 16th-note (16 slots/measure) grid.
const DEFAULT_BEATS_PER_MEASURE = 16;
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
  beatsPerMeasure: number,
): ScheduledNote[] {
  const quarterDur = 60 / Math.max(bpm, 20);
  const measureDur = 4 * quarterDur;
  const beatDur = measureDur / beatsPerMeasure;
  const osc = track.waveform as OscillatorType;
  // Sawtooth (harmony) raised from 0.12: it carries featured guitar solos during
  // instrumental runs, and at the old level they were inaudible under the louder
  // melody/bass. Still below them so dense rhythm chords don't wash the mix out.
  const gainLevel = osc === "triangle" ? 0.32 : osc === "sawtooth" ? 0.17 : 0.22;

  const notes: ScheduledNote[] = [];
  let cursor = 0;

  for (const section of track.sections) {
    for (let mi = 0; mi < section.measures.length; mi++) {
      for (const n of section.measures[mi].notes) {
        notes.push({
          time: cursor + mi * measureDur + (n.beat ?? 0) * beatDur,
          midi: n.pitch,
          waveform: osc,
          duration: (n.dur ?? 1.8) * beatDur,
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
  beatsPerMeasure: number,
): ScheduledDrum[] {
  const quarterDur = 60 / Math.max(bpm, 20);
  const measureDur = 4 * quarterDur;
  const beatDur = measureDur / beatsPerMeasure;

  return patterns
    .map(p => ({ time: p.measure * measureDur + p.beat * beatDur, type: p.type }))
    .sort((a, b) => a.time - b.time);
}

function midiToHz(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/**
 * Master bus: per-note oscillators → master gain → compressor → speakers.
 * Without this every oscillator sums straight into the destination and busy
 * passages (melody + harmony chord + bass) clip into harsh distortion.
 */
function buildOutputChain(ac: AudioContext): AudioNode {
  const master = ac.createGain();
  master.gain.value = 0.9;
  const comp = ac.createDynamicsCompressor();
  comp.threshold.value = -16;
  comp.knee.value = 12;
  comp.ratio.value = 6;
  comp.attack.value = 0.003;
  comp.release.value = 0.2;
  master.connect(comp);
  comp.connect(ac.destination);
  return master;
}

function playTone(ac: AudioContext, out: AudioNode, note: ScheduledNote, when: number) {
  const osc  = ac.createOscillator();
  const gain = ac.createGain();
  osc.connect(gain);
  gain.connect(out);
  osc.type = note.waveform;
  osc.frequency.value = midiToHz(note.midi);

  // Attack/decay/release envelope — hard on/off edges click on every note,
  // and hundreds of clicks per minute read as "noise". The sustain phase
  // decays toward silence (like real chip hardware) so long held notes
  // breathe instead of droning as flat multi-second tones.
  const dur     = Math.max(note.duration, 0.05);
  const attack  = Math.min(0.01, dur * 0.25);
  const release = Math.min(0.09, dur * 0.5);
  const relStart = when + dur - release;
  const decayEnd = Math.min(when + attack + 0.05, relStart);
  const g = gain.gain;
  g.setValueAtTime(0, when);
  g.linearRampToValueAtTime(note.gain, when + attack);
  g.linearRampToValueAtTime(note.gain * 0.7, decayEnd);
  if (relStart > decayEnd + 0.01) {
    g.exponentialRampToValueAtTime(Math.max(note.gain * 0.22, 0.0008), relStart);
  }
  g.linearRampToValueAtTime(0, when + dur);

  osc.start(when);
  osc.stop(when + dur + 0.02);
}

// White-noise burst — the basis of realistic snare/hi-hat hits. A short buffer
// is cheap to (re)create per hit and works in both the live and offline contexts.
function noiseBurst(ac: AudioContext, seconds: number): AudioBufferSourceNode {
  const len = Math.max(1, Math.floor(ac.sampleRate * seconds));
  const buffer = ac.createBuffer(1, len, ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  const src = ac.createBufferSource();
  src.buffer = buffer;
  return src;
}

function playDrum(ac: AudioContext, out: AudioNode, type: "kick" | "snare" | "hihat", when: number) {
  const gain = ac.createGain();
  gain.connect(out);

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
    // Body tone (triangle ~180Hz) + a band-passed noise crack — reads as an
    // actual snare instead of the old buzzy sawtooth.
    const noise = noiseBurst(ac, 0.2);
    const bp = ac.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 1800;
    bp.Q.value = 0.7;
    noise.connect(bp);
    bp.connect(gain);
    const body = ac.createOscillator();
    body.type = "triangle";
    body.frequency.setValueAtTime(180, when);
    body.frequency.exponentialRampToValueAtTime(100, when + 0.1);
    body.connect(gain);
    gain.gain.setValueAtTime(0.5, when);
    gain.gain.exponentialRampToValueAtTime(0.001, when + 0.18);
    noise.start(when); noise.stop(when + 0.2);
    body.start(when);  body.stop(when + 0.12);
  } else {
    // hi-hat: high-passed noise burst, very short decay.
    const noise = noiseBurst(ac, 0.06);
    const hp = ac.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 7000;
    noise.connect(hp);
    hp.connect(gain);
    gain.gain.setValueAtTime(0.22, when);
    gain.gain.exponentialRampToValueAtTime(0.001, when + 0.05);
    noise.start(when); noise.stop(when + 0.06);
  }
}

function fmt(secs: number): string {
  const s = Math.max(0, Math.floor(secs));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

interface ChiptunePlayerProps {
  data: ChiptuneData;
  title?: string;
}

type State = "idle" | "playing" | "paused";

function encodeWav(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate  = buffer.sampleRate;
  const numSamples  = buffer.length;
  const bytesPerSample = 2;
  const dataLen = numSamples * numChannels * bytesPerSample;
  const ab = new ArrayBuffer(44 + dataLen);
  const view = new DataView(ab);

  const write = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };
  write(0, "RIFF");
  view.setUint32(4, 36 + dataLen, true);
  write(8, "WAVE");
  write(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * bytesPerSample, true);
  view.setUint16(32, numChannels * bytesPerSample, true);
  view.setUint16(34, 16, true);
  write(36, "data");
  view.setUint32(40, dataLen, true);

  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const s = Math.max(-1, Math.min(1, buffer.getChannelData(ch)[i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      offset += 2;
    }
  }
  return new Blob([ab], { type: "audio/wav" });
}

async function renderToWav(
  melody: ScheduledNote[],
  harmony: ScheduledNote[],
  bass: ScheduledNote[],
  drums: ScheduledDrum[],
  total: number,
  muted: Record<string, boolean>,
): Promise<Blob> {
  const sampleRate = 22050;
  const offlineAC = new OfflineAudioContext(1, Math.ceil(total * sampleRate), sampleRate);
  const ac = offlineAC as unknown as AudioContext;
  const out = buildOutputChain(ac);

  if (!muted.melody) {
    for (const note of melody) playTone(ac, out, note, note.time);
  }
  if (!muted.harmony) {
    for (const note of harmony) playTone(ac, out, note, note.time);
  }
  if (!muted.bass) {
    for (const note of bass) playTone(ac, out, note, note.time);
  }
  if (!muted.drums) {
    for (const drum of drums) playDrum(ac, out, drum.type, drum.time);
  }

  const rendered = await offlineAC.startRendering();
  return encodeWav(rendered);
}

export default function ChiptunePlayer({ data, title }: ChiptunePlayerProps) {
  const [status, setStatus]       = useState<State>("idle");
  const [progress, setProgress]   = useState(0);
  const [exporting, setExporting] = useState(false);
  // All channels audible by default; each has a mute toggle below. (Drums used
  // to be force-muted when their synthesis was a buzzy sawtooth — now they're
  // proper kick/snare/hi-hat hits, so they're on.)
  const [muted, setMuted]         = useState<Record<string, boolean>>({
    melody: false, harmony: false, bass: false, drums: false,
  });

  const acRef        = useRef<AudioContext | null>(null);
  const outRef       = useRef<AudioNode | null>(null);
  const songStartRef = useRef(0);
  const offsetRef    = useRef(0);
  const rafRef       = useRef(0);
  const timerRef     = useRef(0);
  const mIdxRef      = useRef(0); // melody index
  const hIdxRef      = useRef(0); // harmony index
  const bIdxRef      = useRef(0); // bass index
  const dIdxRef      = useRef(0); // drums index

  const { melody, harmony, bass, drums, total } = useMemo(() => {
    const bpm_slots = data.slots_per_measure ?? DEFAULT_BEATS_PER_MEASURE;
    const m = buildTonalTimeline(data.tracks.melody, data.bpm, bpm_slots);
    const h = data.tracks.harmony ? buildTonalTimeline(data.tracks.harmony, data.bpm, bpm_slots) : [];
    const b = buildTonalTimeline(data.tracks.bass, data.bpm, bpm_slots);
    const d = buildDrumTimeline(data.tracks.drums.patterns, data.bpm, bpm_slots);
    const all = [...m.map(n => n.time), ...h.map(n => n.time), ...b.map(n => n.time), ...d.map(n => n.time)];
    const t = all.length > 0 ? Math.max(...all) + 2 : 30;
    return { melody: m, harmony: h, bass: b, drums: d, total: t };
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
    outRef.current = null;
  }

  function scheduleChunk(ac: AudioContext) {
    const out = outRef.current ?? buildOutputChain(ac);
    const now = ac.currentTime;
    const horizon = now + SCHEDULE_AHEAD;
    const songNow = now - songStartRef.current + offsetRef.current;
    const songHorizon = songNow + SCHEDULE_AHEAD;

    if (!muted.melody) {
      while (mIdxRef.current < melody.length && melody[mIdxRef.current].time <= songHorizon) {
        const note = melody[mIdxRef.current];
        const when = Math.max(songStartRef.current + (note.time - offsetRef.current), now + 0.005);
        if (when < horizon + 0.1) playTone(ac, out, note, when);
        mIdxRef.current++;
      }
    } else {
      while (mIdxRef.current < melody.length && melody[mIdxRef.current].time <= songHorizon) mIdxRef.current++;
    }

    if (!muted.harmony) {
      while (hIdxRef.current < harmony.length && harmony[hIdxRef.current].time <= songHorizon) {
        const note = harmony[hIdxRef.current];
        const when = Math.max(songStartRef.current + (note.time - offsetRef.current), now + 0.005);
        if (when < horizon + 0.1) playTone(ac, out, note, when);
        hIdxRef.current++;
      }
    } else {
      while (hIdxRef.current < harmony.length && harmony[hIdxRef.current].time <= songHorizon) hIdxRef.current++;
    }

    if (!muted.bass) {
      while (bIdxRef.current < bass.length && bass[bIdxRef.current].time <= songHorizon) {
        const note = bass[bIdxRef.current];
        const when = Math.max(songStartRef.current + (note.time - offsetRef.current), now + 0.005);
        if (when < horizon + 0.1) playTone(ac, out, note, when);
        bIdxRef.current++;
      }
    } else {
      while (bIdxRef.current < bass.length && bass[bIdxRef.current].time <= songHorizon) bIdxRef.current++;
    }

    if (!muted.drums) {
      while (dIdxRef.current < drums.length && drums[dIdxRef.current].time <= songHorizon) {
        const drum = drums[dIdxRef.current];
        const when = Math.max(songStartRef.current + (drum.time - offsetRef.current), now + 0.005);
        if (when < horizon + 0.1) playDrum(ac, out, drum.type, when);
        dIdxRef.current++;
      }
    } else {
      while (dIdxRef.current < drums.length && drums[dIdxRef.current].time <= songHorizon) dIdxRef.current++;
    }

    const anyLeft = mIdxRef.current < melody.length
      || hIdxRef.current < harmony.length
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
    outRef.current = buildOutputChain(ac);

    const now = ac.currentTime + 0.05;
    songStartRef.current = now;

    // Reset indices to offset position
    const offset = offsetRef.current;
    mIdxRef.current = melody.findIndex(n => n.time >= offset);
    if (mIdxRef.current === -1) mIdxRef.current = melody.length;
    hIdxRef.current = harmony.findIndex(n => n.time >= offset);
    if (hIdxRef.current === -1) hIdxRef.current = harmony.length;
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

  async function handleDownload() {
    setExporting(true);
    try {
      const blob = await renderToWav(melody, harmony, bass, drums, total, muted);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const safeName = (title ?? "chiptune").replace(/[^a-z0-9_\- ]/gi, "_");
      a.download = `${safeName}_16bit.wav`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }

  const elapsed = progress * total;
  const trackKeys = [
    "melody",
    ...(data.tracks.harmony ? ["harmony"] : []),
    "bass",
    ...(data.tracks.drums?.patterns?.length ? ["drums"] : []),
  ];
  const trackLabels: Record<string, string> = { melody: "Melody", harmony: "Harmony", bass: "Bass", drums: "Drums" };

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

      {/* Track mute toggles + download */}
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

        <button
          onClick={handleDownload}
          disabled={exporting}
          className="ml-auto flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold
                     border border-purple-400/40 text-purple-400 hover:bg-purple-400/10
                     disabled:opacity-50 disabled:cursor-wait transition-colors"
        >
          {exporting ? (
            <>
              <svg className="animate-spin w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" strokeOpacity="0.3"/>
                <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round"/>
              </svg>
              Rendering…
            </>
          ) : (
            <>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 3v13M5 16l7 7 7-7"/><line x1="3" y1="23" x2="21" y2="23"/>
              </svg>
              WAV
            </>
          )}
        </button>
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

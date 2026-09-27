import { rollBlocks } from "../lib/tracker";

const STEP = 14; // px per sixteenth
const LANE = 10; // px per pitch lane
const COLS = 96;
const LANES = 56;

/** One colour per voice, in the same order the chiptune engine stacks them. */
const VOICES = [
  "var(--pix-voice-melody)",
  "var(--pix-voice-harmony)",
  "var(--pix-voice-lead)",
  "var(--pix-voice-bass)",
];

interface Props {
  seed?: number;
  /** 0–1. Sections behind body copy want ~0.4; a hero can take 1. */
  intensity?: number;
  className?: string;
}

/**
 * The backdrop: a sequencer roll with the bar lines, the notes and a playhead
 * sweeping across it. It is the artefact this app produces, used as wallpaper.
 *
 * Rendered from seeded geometry at module scope — no canvas, no effect hook,
 * no layout thrash — and cropped rather than stretched so the note blocks stay
 * square at any aspect ratio.
 */
export default function PianoRollBackdrop({ seed = 11, intensity = 1, className = "" }: Props) {
  const W = COLS * STEP;
  const H = LANES * LANE;
  const blocks = rollBlocks({ seed, cols: COLS, lanes: LANES, voices: VOICES.length, density: 0.45 });
  const gridId = `roll-${seed}`;

  return (
    <div aria-hidden className={`pointer-events-none overflow-hidden ${className}`}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid slice"
        className="h-full w-full"
        shapeRendering="crispEdges"
      >
        <defs>
          {/* Lane lines and step lines — the ruled paper under the notes. */}
          <pattern id={gridId} width={STEP * 4} height={LANE} patternUnits="userSpaceOnUse">
            <rect
              x={0}
              y={0}
              width={STEP * 4}
              height={1}
              fill="var(--pix-grid)"
              opacity={0.5 * intensity}
            />
            <rect x={0} y={0} width={1} height={LANE} fill="var(--pix-grid)" opacity={0.5 * intensity} />
          </pattern>
        </defs>

        <rect width={W} height={H} fill={`url(#${gridId})`} />

        {/* Bar lines every four beats. */}
        {Array.from({ length: Math.ceil(COLS / 16) }, (_, i) => (
          <rect
            key={`bar${i}`}
            x={i * 16 * STEP}
            y={0}
            width={2}
            height={H}
            fill="var(--pix-grid)"
            opacity={1.1 * intensity}
          />
        ))}

        {/* Notes. */}
        {blocks.map((b, i) => (
          <rect
            key={i}
            x={b.x * STEP + 1}
            y={b.y * LANE + 1}
            width={b.len * STEP - 2}
            height={LANE - 2}
            fill={VOICES[b.voice]}
            opacity={0.5 * intensity}
          />
        ))}

        {/* Playhead: one bright column crossing the roll, forever. */}
        <rect
          className="playhead"
          x={0}
          y={0}
          width={2}
          height={H}
          fill="var(--pix-playhead)"
          opacity={0.9 * intensity}
          style={{ ["--roll-w" as string]: `${W}px` }}
        />
      </svg>
    </div>
  );
}

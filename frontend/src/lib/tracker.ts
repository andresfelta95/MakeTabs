/**
 * Piano-roll geometry for the page backdrop.
 *
 * The portfolio site draws circuit traces because it is about circuits. This
 * app is about turning a recording into notes on a grid, so its backdrop is
 * the thing it produces: a sequencer roll. Everything here is pure and seeded
 * so the layout is stable across renders and never reflows under the content.
 */

export interface Block {
  /** Column index (one step). */
  x: number;
  /** Lane index (one pitch row). */
  y: number;
  /** Length in steps. */
  len: number;
  /** Which voice it belongs to — index into the caller's colour list. */
  voice: number;
}

/** mulberry32 — small, fast, good enough for layout jitter. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Lay notes out on a roll.
 *
 * Each voice keeps to its own band of lanes (bass low, melody high, like a
 * real arrangement) and walks left to right leaving gaps, so the result reads
 * as a performance rather than as confetti.
 */
export function rollBlocks(opts: {
  seed: number;
  cols: number;
  lanes: number;
  voices: number;
  /** 0–1: how much of each voice's line is filled with notes. */
  density?: number;
}): Block[] {
  const { seed, cols, lanes, voices } = opts;
  const density = opts.density ?? 0.5;
  const rand = rng(seed);
  const blocks: Block[] = [];
  const bandHeight = lanes / voices;

  for (let v = 0; v < voices; v++) {
    // Voice 0 sits at the top of the roll (melody), the last at the bottom.
    const bandTop = Math.floor(v * bandHeight);
    const bandSize = Math.max(1, Math.floor(bandHeight) - 1);
    let lane = bandTop + Math.floor(rand() * bandSize);
    let x = Math.floor(rand() * 8);

    while (x < cols) {
      const len = 1 + Math.floor(rand() * 4);
      if (rand() < density) {
        blocks.push({ x, y: lane, len: Math.min(len, cols - x), voice: v });
        // Step by a small interval, the way a melody moves.
        const step = Math.round((rand() - 0.5) * 4);
        lane = Math.max(bandTop, Math.min(bandTop + bandSize, lane + step));
      }
      x += len + Math.floor(rand() * 3);
    }
  }

  return blocks;
}

/**
 * Hand-drawn pixel art, stored as character grids.
 *
 * Every sprite is authored on a 16×16 grid and rendered to SVG rects by
 * <PixelSprite>, so it stays crisp at any scale and ships as markup rather
 * than as an image. `.` is transparent; every other character indexes into the
 * sprite's own palette.
 *
 * Two palette values are special:
 *   "@"        → `currentColor`, so a sprite can inherit the text colour
 *   "var(--x)" → a CSS variable, so a sprite re-themes with light/dark mode
 *
 * The subject matter is the product: picks, amps, cartridges, sound chips and
 * the five waveforms the chiptune engine actually plays.
 *
 * `assertSprites()` at the bottom checks row shape in development, so a
 * mis-typed row fails loudly instead of silently drawing a hole.
 */
export interface Sprite {
  w: number;
  h: number;
  palette: Record<string, string>;
  rows: string[];
}

/* ── Waveforms ────────────────────────────────────────────────────────────
   One per voice in the chiptune engine. These are not decoration: the player
   puts each one next to the channel it belongs to, so the mute row doubles as
   a legend for what the song is actually being rebuilt out of. */

/** Square — the melody voice (vocals). */
const waveSquare: Sprite = {
  w: 16,
  h: 16,
  palette: { g: "@" },
  rows: [
    "................",
    "................",
    "................",
    "..gggg....gggg..",
    "..g..g....g..g..",
    "..g..g....g..g..",
    "..g..g....g..g..",
    "..g..g....g..g..",
    "..g..g....g..g..",
    "..g..g....g..g..",
    "..g..g....g..g..",
    "ggg..gggggg..ggg",
    "................",
    "................",
    "................",
    "................",
  ],
};

/** Pulse, 25% duty — the solo / lead voice. Narrower highs than the square. */
const wavePulse: Sprite = {
  w: 16,
  h: 16,
  palette: { g: "@" },
  rows: [
    "................",
    "................",
    "................",
    "..ggg.....ggg...",
    "..g.g.....g.g...",
    "..g.g.....g.g...",
    "..g.g.....g.g...",
    "..g.g.....g.g...",
    "..g.g.....g.g...",
    "..g.g.....g.g...",
    "..g.g.....g.g...",
    "gg..ggggggg.gggg",
    "................",
    "................",
    "................",
    "................",
  ],
};

/** Sawtooth — the harmony voice (rhythm guitar). */
const waveSaw: Sprite = {
  w: 16,
  h: 16,
  palette: { g: "@" },
  rows: [
    "................",
    "................",
    "................",
    "................",
    ".......g.......g",
    "......gg......gg",
    ".....g.g.....g.g",
    "....g..g....g..g",
    "...g...g...g...g",
    "..g....g..g....g",
    ".g.....g.g.....g",
    "g......gg......g",
    "................",
    "................",
    "................",
    "................",
  ],
};

/** Triangle — the bass voice. */
const waveTriangle: Sprite = {
  w: 16,
  h: 16,
  palette: { g: "@" },
  rows: [
    "................",
    "................",
    "................",
    "................",
    ".......gg.......",
    "......g..g......",
    ".....g....g.....",
    "....g......g....",
    "...g........g...",
    "..g..........g..",
    ".g............g.",
    "g..............g",
    "................",
    "................",
    "................",
    "................",
  ],
};

/** Noise — the drum voice. */
const waveNoise: Sprite = {
  w: 16,
  h: 16,
  palette: { g: "@" },
  rows: [
    "................",
    "................",
    "................",
    "................",
    "....g..g...g....",
    "..g.g..g...g..g.",
    "..g.g..g.g.g..g.",
    "..g.g.gg.g.g..g.",
    "..g.g.gg.g.g.gg.",
    ".gg.g.gg.ggg.gg.",
    ".gggg.gggggg.ggg",
    ".ggggggggggggggg",
    "................",
    "................",
    "................",
    "................",
  ],
};

/* ── Objects ──────────────────────────────────────────────────────────── */

/** Guitar plectrum. The brand mark and the tabs product. */
const pick: Sprite = {
  w: 16,
  h: 16,
  palette: { d: "var(--pix-shade)", g: "@", l: "var(--pix-light)" },
  rows: [
    "................",
    ".....dddddd.....",
    "....dggggggd....",
    "...dllggggggd...",
    "...dlgggggggd...",
    "...dggggggggd...",
    "....dggggggd....",
    "....dggggggd....",
    ".....dggggd.....",
    ".....dggggd.....",
    "......dggd......",
    "......dggd......",
    ".......dd.......",
    ".......dd.......",
    "................",
    "................",
  ],
};

/** Amp cabinet: control panel with knobs over a woven speaker grille. */
const amp: Sprite = {
  w: 16,
  h: 16,
  palette: {
    c: "@",
    d: "var(--pix-body)",
    o: "@",
    s: "var(--pix-mesh-a)",
  },
  rows: [
    "................",
    ".cccccccccccccc.",
    ".cddddddddddddc.",
    ".cdoddoddoddodc.",
    ".cddddddddddddc.",
    ".cssssssssssssc.",
    ".cddddddddddddc.",
    ".cssssssssssssc.",
    ".cddddddddddddc.",
    ".cssssssssssssc.",
    ".cddddddddddddc.",
    ".cssssssssssssc.",
    ".cddddddddddddc.",
    ".cccccccccccccc.",
    "..c..........c..",
    "................",
  ],
};

/** Game cartridge. The 16-bit product. */
const cart: Sprite = {
  w: 16,
  h: 16,
  palette: {
    c: "@",
    d: "var(--pix-shade)",
    l: "var(--pix-light)",
    g: "var(--pix-gold)",
  },
  rows: [
    "................",
    "..cccccccccccc..",
    "..cddddddddddc..",
    "..cdlllllllldc..",
    "..cdlllllllldc..",
    "..cdlllllllldc..",
    "..cdlllllllldc..",
    "..cddddddddddc..",
    "..cddddddddddc..",
    "..cddddddddddc..",
    "..cccccccccccc..",
    "...gggggggggg...",
    "...g.g.g.g.g....",
    "...gggggggggg...",
    "................",
    "................",
  ],
};

/** DIP sound chip. The synth engine itself. */
const soundchip: Sprite = {
  w: 16,
  h: 16,
  palette: {
    d: "var(--pix-shade)",
    b: "var(--pix-light)",
    v: "@",
    p: "var(--pix-gold)",
    k: "var(--pix-mesh-a)",
  },
  rows: [
    "................",
    "................",
    "....dddkkddd....",
    ".pppdbbbbbbdppp.",
    "....dbbbbbbd....",
    ".pppdbvvvvbdppp.",
    "....dbvvvvbd....",
    ".pppdbvvvvbdppp.",
    "....dbvvvvbd....",
    ".pppdbbbbbbdppp.",
    "....dbbbbbbd....",
    ".pppdbbbbbbdppp.",
    "....dbbbbbbd....",
    "....dddddddd....",
    "................",
    "................",
  ],
};

/** Cassette. Marks a saved library. */
const cassette: Sprite = {
  w: 16,
  h: 16,
  palette: {
    c: "@",
    l: "var(--pix-light)",
    b: "var(--pix-body)",
    w: "var(--pix-hi)",
  },
  rows: [
    "................",
    "................",
    "................",
    ".cccccccccccccc.",
    ".cllllllllllllc.",
    ".cllllllllllllc.",
    ".cbbbbbbbbbbbbc.",
    ".cbwwbbbbbbwwbc.",
    ".cbwwbbbbbbwwbc.",
    ".cbbbbbbbbbbbbc.",
    ".cllllllllllllc.",
    ".cllllbbbbllllc.",
    ".cccccccccccccc.",
    "................",
    "................",
    "................",
  ],
};

/** Folder tab. Used by the folder chips. */
const folder: Sprite = {
  w: 16,
  h: 16,
  palette: { c: "@", l: "var(--pix-light)" },
  rows: [
    "................",
    "................",
    "................",
    "..cccc..........",
    ".cccccccccccccc.",
    ".cllllllllllllc.",
    ".cllllllllllllc.",
    ".cllllllllllllc.",
    ".cllllllllllllc.",
    ".cllllllllllllc.",
    ".cllllllllllllc.",
    ".cllllllllllllc.",
    ".cccccccccccccc.",
    "................",
    "................",
    "................",
  ],
};

/** Beamed eighth notes. Generic "there is music here". */
const notes: Sprite = {
  w: 16,
  h: 16,
  palette: { g: "@" },
  rows: [
    "................",
    "................",
    "................",
    "....gggggggg....",
    "....gggggggg....",
    "....g......g....",
    "....g......g....",
    "....g......g....",
    "....g......g....",
    "....g......g....",
    ".gggg...gggg....",
    ".gggg...gggg....",
    ".gggg...gggg....",
    "................",
    "................",
    "................",
  ],
};

/** Magnifier. The search field. */
const magnifier: Sprite = {
  w: 16,
  h: 16,
  palette: { g: "@" },
  rows: [
    "................",
    "................",
    "....gggg........",
    "...g....g.......",
    "..g......g......",
    "..g......g......",
    "..g......g......",
    "...g....g.......",
    "....gggg........",
    "........gg......",
    ".........gg.....",
    "..........gg....",
    "...........gg...",
    "................",
    "................",
    "................",
  ],
};

export const SPRITES = {
  waveSquare,
  wavePulse,
  waveSaw,
  waveTriangle,
  waveNoise,
  pick,
  amp,
  cart,
  soundchip,
  cassette,
  folder,
  notes,
  magnifier,
} satisfies Record<string, Sprite>;

export type SpriteName = keyof typeof SPRITES;

/** Chiptune channel → the waveform it is actually synthesised with. */
export const CHANNEL_SPRITE = {
  melody: "waveSquare",
  harmony: "waveSaw",
  lead: "wavePulse",
  bass: "waveTriangle",
  drums: "waveNoise",
} as const satisfies Record<string, SpriteName>;

/* Development-only shape check: a row of the wrong length would otherwise
   just draw a short line and look like a design choice. */
if (import.meta.env.DEV) {
  for (const [name, sprite] of Object.entries(SPRITES)) {
    if (sprite.rows.length !== sprite.h) {
      throw new Error(`sprite "${name}": ${sprite.rows.length} rows, expected ${sprite.h}`);
    }
    sprite.rows.forEach((row, y) => {
      if (row.length !== sprite.w) {
        throw new Error(`sprite "${name}" row ${y}: ${row.length} px, expected ${sprite.w}`);
      }
      for (const ch of row) {
        if (ch !== "." && !(ch in sprite.palette)) {
          throw new Error(`sprite "${name}" row ${y}: "${ch}" is not in the palette`);
        }
      }
    });
  }
}

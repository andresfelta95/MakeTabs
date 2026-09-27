# UI design system — "backstage amp-rig, 16-bit"

One concept drives the whole frontend: **a backstage amp-rig at night** — warm
tube-amber glow on stage-black. Light mode is the daylight version: warm paper,
darker amber. The 16-bit/chiptune feature has its own sub-identity (violet,
arcade-cab energy) so the two products are visually distinct at a glance.

The 2026-09 pass added a **pixel-art layer** on top of that: character-grid
sprites, a sequencer-roll backdrop, bitmap display type and square chrome.
It did not replace the amber/violet coding — **amber means tabs and violet
means 16-bit is semantic, not decoration**, and it is the only part of the
palette that survives the light/dark flip intact.

## Tokens (`frontend/src/index.css`)

Everything themes through CSS variables; components use the utility classes, not
raw colors. **Keep the class names stable** (`bg-base`, `bg-elevated`, `bg-card`,
`bg-card-hover`, `text-primary`, `text-secondary`, `border-theme`) — the players'
chrome and every page inherit a re-theme automatically.

| Token | Dark (default) | Light |
|---|---|---|
| `--bg-base` | `#0f0d0a` stage-black | `#f6f2ea` warm paper |
| `--bg-elevated` / `--bg-card` / `--bg-hover` | warm blacks | warm whites |
| `--text-primary` / `--text-secondary` | `#f4eee3` / `#a3988a` | `#1c1712` / `#6e6353` |
| `--accent` | `#fbbf24` tube-glow amber | `#b45309` amber-700 (AA on paper) |
| `--on-accent` | near-black | near-white |
| `--chip` | `#a78bfa` violet | `#7c5cd6` violet |

- **`--on-accent` is mandatory on amber fills** (`text-on-accent`): amber flips
  from light (dark mode) to dark (light mode), so hardcoded `text-black` breaks
  light-mode contrast.
- Tailwind exposes `accent` and `chip` as theme-aware colors
  (`tailwind.config.js` maps them to the CSS vars).
- **Spotify green survives in exactly one place**: the "Continue with Spotify"
  login button (brand requirement). Don't reintroduce it elsewhere.

### Pixel tokens

Sprites use `"@"` (→ `currentColor`) for their main hue and these for the fixed
parts, so **one grid works in both themes**:

| Token | Role |
|---|---|
| `--pix-body` | cabinet / shell interior — dark in both themes |
| `--pix-light` | panel face, folder fill — a translucent lift |
| `--pix-hi` | tape reels, highlights — bright in both themes |
| `--pix-shade` | outline / shadow side |
| `--pix-gold` | cartridge connectors, chip pins |
| `--pix-mesh-a/b` | speaker grille slats |
| `--pix-grid`, `--pix-playhead`, `--pix-voice-*` | sequencer-roll backdrop |

## The pixel art

There are **no image assets** — everything is generated markup.

- **`src/lib/sprites.ts`** — 13 sprites authored as 16×16 character grids with a
  per-sprite palette (`.` is transparent). A `import.meta.env.DEV` assertion
  throws if a row is the wrong length or uses a colour not in the palette, so a
  typo fails loudly instead of silently drawing a hole.
- **`src/components/PixelSprite.tsx`** — renders a grid to SVG, collapsing runs
  of identical pixels into single `<rect>`s, with `shapeRendering="crispEdges"`
  so it stays sharp at any scale.
- **`src/lib/tracker.ts` + `PianoRollBackdrop.tsx`** — the backdrop is a
  sequencer roll: ruled lanes, bar lines, seeded note blocks banded by voice,
  and a playhead sweeping across. Pure and seeded, so it never reflows.
- **`src/components/pixel.tsx`** — `PixelPanel`, `PixelHeading`, `Led`,
  `PixelMeter`, `PixelTag`. All take `accent: "accent" | "chip"`.
- **`src/components/StepRack.tsx`** — the pipeline as a rack of channel strips,
  shared by both viewers so a job looks the same whichever product made it.

**Subject matter is the product.** The sprites are a pick, an amp cab, a
cartridge, a DIP sound chip, a cassette, a folder, beamed notes, a magnifier —
and the five waveforms the chiptune engine actually plays.

### The waveform sprites are not decoration

`CHANNEL_SPRITE` maps each chiptune channel to the waveform it is synthesised
with: melody→square, harmony→sawtooth, lead→pulse, bass→triangle, drums→noise.
`ChiptunePlayer` puts each sprite on its channel's mute button, so **the mute
row doubles as a legend for what the song was rebuilt out of**. If the engine's
waveform for a voice ever changes, change it here too or the UI starts lying.

## Type

Loaded in `frontend/index.html` (Google Fonts):

- **Press Start 2P** — bitmap display face (`.font-pixel`, which also applies
  the tracking and uppercasing it needs). **Short, fixed strings only**: brand,
  section headers, badges, button labels, stat readouts. It is unreadable as
  running text and has no lowercase to speak of.
- **Bricolage Grotesque** — display for *variable-length* headings where bitmap
  would break: song titles, "Results for …". `h1–h3` get it automatically.
- **Space Grotesk** — body (default on `body`).
- **JetBrains Mono** — durations, counts, tunings, error text (`font-mono`).

Rule of thumb: if the string comes from user data or an API, it is **not**
`font-pixel`.

## Atmosphere

- A fixed radial **stage-light glow** (`body::before`, `--glow`) falls from above
  the header; `#root` sits above it.
- The header has an amber **power-line hairline**.
- **Corner brackets** (two per panel, opposite corners) replace rounded corners
  as the "this is a unit on the rig" signal. The pixel layer has no border-radius.
- **Glow and scanlines are dark-mode only** (`.pix-glow`, `.pix-scan` are
  no-ops outside `.dark`). On warm paper a neon bloom reads as a printing
  error, so light mode leans on weight and border instead.
- Chiptune cards keep their scanline overlay; the eq bars (`animate-eq1/2/3`)
  are still the processing indicator.

## UX rules (learned, keep them)

- **Never hide primary actions behind hover.** Track-row buttons are always
  visible, labeled, with `title` tooltips.
- Search is the hero action on Home; the hero collapses while searching.
- Library cards are keyboard-accessible (`role="button"`, `tabIndex`, Enter).
- Global `:focus-visible` amber ring; `prefers-reduced-motion` kills animations
  **and hides the playhead** rather than freezing it mid-sweep.
- Entrances (`.pix-rise`) are CSS with `animation-fill-mode: both`, not JS, so
  content is readable even if the bundle is slow or blocked.

## Scope guard

The 2026-09 pixel pass was **frontend-visual only**. `ChiptunePlayer` and
`TabPlayer` audio logic, scheduling, gains and envelopes were untouched — only
their JSX. Two deliberate non-visual exceptions, both additive:

1. **A Drums toggle was added** to `ChiptunePlayer`. Drums were always generated
   and always default-muted, but `trackKeys` omitted them so there was no way to
   turn them on. Still muted by default, still only rendered when the job has
   drum patterns — the default mix is byte-for-byte unchanged.
2. **Leftover Spanish strings** in `TabPlayer` and `BackendAudioPlayer` were
   translated to match the rest of the app.

Deploying UI changes = rebuild **`maketabs-frontend`** (see `DOS_AND_DONTS.md`).
`PlaylistList.tsx` is dead code (unimported) and still old-styled — restyle or
delete it if it ever comes back into use.

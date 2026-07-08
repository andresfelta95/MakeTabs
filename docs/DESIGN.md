# UI design system — "backstage amp-rig"

One concept drives the whole frontend: **a backstage amp-rig at night** — warm
tube-amber glow on stage-black. Light mode is the daylight version: warm paper,
darker amber. The 16-bit/chiptune feature has its own sub-identity (violet,
arcade-cab energy) so the two products are visually distinct at a glance.

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

## Type

Loaded in `frontend/index.html` (Google Fonts):

- **Bricolage Grotesque** — display: headlines, brand, section headers
  (`font-display`, weights 500/700/800). `h1–h3` get it automatically.
- **Space Grotesk** — body (default on `body`).
- **JetBrains Mono** — durations, status badges, counts (`font-mono`).

## Atmosphere

- A fixed radial **stage-light glow** (`body::before`, `--glow`) falls from above
  the header; `#root` sits above it.
- The header has an amber **power-line hairline**
  (`bg-gradient-to-r from-transparent via-accent/50 to-transparent`).
- Chiptune cards keep their scanline overlay; the eq bars (`animate-eq1/2/3`)
  are the processing indicator.

## UX rules (learned, keep them)

- **Never hide primary actions behind hover.** Track-row buttons are always
  visible, labeled ("🎸 Tabs" / "🕹️ 16-bit" / "▶ View tab") with `title`
  tooltips.
- Search is the hero action on Home; the hero collapses while searching.
- First-run empty state shows the 1-2-3 "Search / Pick a format / Play along"
  strip (only when both libraries are empty).
- Section headers: display font + mono count badge + one-line hint; amber for
  tabs, violet for 16-bit.
- Library cards are keyboard-accessible (`role="button"`, `tabIndex`, Enter).
- Global `:focus-visible` amber ring; `prefers-reduced-motion` kills animations.

## Scope guard

The 2026-07-03 refresh was **frontend-visual only**: tokens, fonts, layout,
labels. `ChiptunePlayer`/`TabPlayer` audio and pipeline logic were untouched
(only color classnames on two buttons). Deploying UI changes = rebuild
**`maketabs-frontend`** (see `DOS_AND_DONTS.md`). `PlaylistList.tsx` is dead
code (unimported) and still old-styled — restyle or delete it if it ever comes
back into use.

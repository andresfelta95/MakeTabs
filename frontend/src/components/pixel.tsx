import PixelSprite from "./PixelSprite";
import type { Sprite } from "../lib/sprites";

/* Shared pixel-layer primitives. Everything here is theme-aware: the caller
   passes "accent" (tabs, amber) or "chip" (16-bit, violet) and the component
   resolves it, so no page hardcodes a colour. */

export type Accent = "accent" | "chip";

const TEXT: Record<Accent, string> = { accent: "text-accent", chip: "text-chip" };
const BORDER: Record<Accent, string> = { accent: "border-accent", chip: "border-chip" };
const GLOW: Record<Accent, string> = { accent: "pix-glow", chip: "pix-glow-chip" };

/**
 * A unit on the rig: hairline frame plus two corner brackets in the section's
 * colour. Square by design — the pixel layer has no rounded corners.
 */
export function PixelPanel({
  children,
  accent = "accent",
  label,
  meta,
  className = "",
}: {
  children: React.ReactNode;
  accent?: Accent;
  /** Optional header strip, in bitmap type. */
  label?: string;
  meta?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`relative border border-theme bg-card ${className}`}>
      <span
        aria-hidden
        className={`absolute left-0 top-0 h-2 w-2 border-l border-t ${BORDER[accent]} opacity-70`}
      />
      <span
        aria-hidden
        className={`absolute bottom-0 right-0 h-2 w-2 border-b border-r ${BORDER[accent]} opacity-70`}
      />
      {label && (
        <div className="flex items-center justify-between gap-3 border-b border-theme px-3 py-2">
          <span className={`font-pixel text-[9px] ${TEXT[accent]}`}>{label}</span>
          {meta}
        </div>
      )}
      {children}
    </div>
  );
}

/**
 * Section header: bitmap title with the section's sprite, the underline rule
 * the design already used, and an optional count badge.
 */
export function PixelHeading({
  title,
  sprite,
  accent = "accent",
  count,
  hint,
  as: Tag = "h2",
}: {
  title: string;
  sprite?: Sprite;
  accent?: Accent;
  count?: number;
  hint?: string;
  as?: "h1" | "h2";
}) {
  return (
    <div className="mb-4">
      <div className="flex items-center gap-2.5">
        {sprite && (
          <PixelSprite
            sprite={sprite}
            className={`h-6 w-6 shrink-0 ${TEXT[accent]} ${GLOW[accent]}`}
          />
        )}
        <Tag className={`font-pixel text-[13px] leading-snug text-primary sm:text-[15px]`}>
          {title}
        </Tag>
        {typeof count === "number" && count > 0 && (
          <span
            className={`border px-1.5 py-0.5 font-mono text-[10px] font-semibold ${TEXT[accent]} ${BORDER[accent]}/40`}
          >
            {count}
          </span>
        )}
      </div>
      {hint && <p className="mt-1.5 text-sm text-secondary">{hint}</p>}
      <div
        className={`mt-2 h-0.5 w-10 ${accent === "chip" ? "bg-chip" : "bg-accent"} opacity-60`}
      />
    </div>
  );
}

/** Channel LED. `pulse` marks something that is genuinely running. */
export function Led({
  accent = "accent",
  pulse = false,
  on = true,
}: {
  accent?: Accent;
  pulse?: boolean;
  on?: boolean;
}) {
  return (
    <span
      aria-hidden
      className={`inline-block h-2 w-2 shrink-0 ${pulse ? "pix-led" : ""} ${
        on ? (accent === "chip" ? "bg-chip" : "bg-accent") : "bg-current opacity-25"
      }`}
    />
  );
}

/**
 * Segmented meter. Discrete blocks rather than a smooth fill — a bar graph on
 * an LED panel, which is what the rest of the chrome is pretending to be.
 */
export function PixelMeter({
  value,
  accent = "accent",
  segments = 32,
  className = "",
}: {
  /** 0–1. */
  value: number;
  accent?: Accent;
  segments?: number;
  className?: string;
}) {
  const filled = Math.round(Math.min(Math.max(value, 0), 1) * segments);
  return (
    <div className={`flex gap-[2px] ${className}`} aria-hidden>
      {Array.from({ length: segments }, (_, i) => (
        <span
          key={i}
          className={`h-2 flex-1 ${
            i < filled
              ? accent === "chip"
                ? "bg-chip"
                : "bg-accent"
              : "bg-current opacity-[0.12]"
          }`}
        />
      ))}
    </div>
  );
}

/** A square spec chip. Reads as a labelled part on the rig. */
export function PixelTag({ children }: { children: React.ReactNode }) {
  return (
    <span className="border border-theme px-1.5 py-0.5 font-mono text-[10px] text-secondary">
      {children}
    </span>
  );
}

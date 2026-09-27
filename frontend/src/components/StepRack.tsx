import PixelSprite from "./PixelSprite";
import { PixelMeter } from "./pixel";
import { SPRITES } from "../lib/sprites";

export type StepState = "done" | "active" | "pending" | "failed";

export interface RackStep {
  key: string;
  label: string;
}

/**
 * The pipeline as a rack of channel strips: one lit LED per completed stage
 * and a segmented meter for overall progress.
 *
 * Shared by the tab and chiptune viewers so a job looks the same whichever
 * product produced it; only the accent colour differs.
 */
export default function StepRack({
  steps,
  status,
  currentStep,
  accent = "accent",
  error,
}: {
  steps: RackStep[];
  status: string;
  currentStep: string | null;
  accent?: "accent" | "chip";
  error?: string | null;
}) {
  const order = steps.map((s) => s.key);
  const currentIdx = currentStep ? order.indexOf(currentStep) : 0;

  const stateOf = (key: string): StepState => {
    if (status === "done") return "done";
    if (status === "failed") return key === (currentStep ?? order[0]) ? "failed" : "pending";
    if (status === "processing") {
      const i = order.indexOf(key);
      if (i < currentIdx) return "done";
      if (i === currentIdx) return "active";
      return "pending";
    }
    return "pending";
  };

  const doneCount = steps.filter((s) => stateOf(s.key) === "done").length;
  const progress = status === "done" ? 1 : doneCount / steps.length;
  const color = accent === "chip" ? "text-chip" : "text-accent";
  const bg = accent === "chip" ? "bg-chip" : "bg-accent";
  const border = accent === "chip" ? "border-chip" : "border-accent";

  return (
    <div className="relative border border-theme bg-card p-5">
      <span
        aria-hidden
        className={`absolute left-0 top-0 h-2.5 w-2.5 border-l border-t ${border} opacity-70`}
      />
      <span
        aria-hidden
        className={`absolute bottom-0 right-0 h-2.5 w-2.5 border-b border-r ${border} opacity-70`}
      />

      <div className="mb-4 flex items-center gap-2.5">
        <PixelSprite
          sprite={accent === "chip" ? SPRITES.soundchip : SPRITES.amp}
          className={`h-6 w-6 shrink-0 ${color}`}
        />
        <span className={`font-pixel text-[10px] ${color}`}>
          {status === "failed" ? "Job failed" : status === "done" ? "Complete" : "Working"}
        </span>
        <span className="ml-auto font-mono text-[11px] text-secondary">
          {doneCount}/{steps.length}
        </span>
      </div>

      <PixelMeter value={progress} accent={accent} segments={28} className={`mb-5 ${color}`} />

      <ol className="space-y-2.5">
        {steps.map((step) => {
          const s = stateOf(step.key);
          return (
            <li key={step.key} className="flex items-center gap-3">
              <span
                aria-hidden
                className={`h-2.5 w-2.5 shrink-0 ${
                  s === "done"
                    ? bg
                    : s === "active"
                      ? `${bg} pix-led`
                      : s === "failed"
                        ? "bg-red-500"
                        : "border border-theme"
                }`}
              />
              <span
                className={`text-sm ${
                  s === "active"
                    ? "font-medium text-primary"
                    : s === "failed"
                      ? "text-red-400"
                      : "text-secondary"
                }`}
              >
                {step.label}
              </span>
              {s === "active" && (
                <span className="ml-1 inline-flex h-3 items-end gap-[2px]">
                  <span className={`w-[3px] animate-eq1 ${bg}`} />
                  <span className={`w-[3px] animate-eq2 ${bg}`} />
                  <span className={`w-[3px] animate-eq3 ${bg}`} />
                </span>
              )}
            </li>
          );
        })}
      </ol>

      {error && (
        <p className="mt-4 border border-red-500/30 bg-red-500/10 p-3 font-mono text-xs text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}

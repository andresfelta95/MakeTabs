import { useNavigate } from "react-router-dom";
import type { LibraryCardJob } from "../types";
import PixelSprite from "./PixelSprite";
import { SPRITES } from "../lib/sprites";

interface TabCardProps {
  job: LibraryCardJob;
  /** Extra control rendered over the art's top-left corner (e.g. save-to-folder). */
  topLeftAction?: React.ReactNode;
}

export default function TabCard({ job, topLeftAction }: TabCardProps) {
  const navigate = useNavigate();
  const track = job.track;

  const handleClick = () => {
    if (job.status === "done") {
      navigate(`/tab/${job.job_id}`);
    }
  };

  return (
    <div
      onClick={handleClick}
      role={job.status === "done" ? "button" : undefined}
      tabIndex={job.status === "done" ? 0 : undefined}
      onKeyDown={(e) => e.key === "Enter" && handleClick()}
      aria-label={job.status === "done" ? `Open tab: ${track?.title ?? "song"}` : undefined}
      className={`group relative overflow-hidden border border-theme bg-card
                  transition-colors hover:border-accent/50
                  ${job.status === "done" ? "cursor-pointer" : "cursor-default"}`}
    >
      {/* Corner brackets light up with the card. */}
      <span
        aria-hidden
        className="absolute left-0 top-0 z-10 h-2.5 w-2.5 border-l border-t border-accent opacity-0 transition-opacity group-hover:opacity-80"
      />
      <span
        aria-hidden
        className="absolute bottom-0 right-0 z-10 h-2.5 w-2.5 border-b border-r border-accent opacity-0 transition-opacity group-hover:opacity-80"
      />

      {/* Album art */}
      <div className="relative aspect-square overflow-hidden bg-card">
        {track?.image_url ? (
          <img
            src={track.image_url}
            alt={track.album ?? track.title}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-accent/20 to-accent/5">
            <PixelSprite sprite={SPRITES.pick} className="h-10 w-10 text-accent/50" />
          </div>
        )}

        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />

        <div className="absolute right-2 top-2">
          <StatusBadge status={job.status} step={job.current_step} />
        </div>

        {topLeftAction && <div className="absolute left-2 top-2">{topLeftAction}</div>}

        {/* Play button on hover */}
        {job.status === "done" && (
          <div className="absolute bottom-2 right-2 opacity-0 transition-opacity group-hover:opacity-100">
            <div className="flex h-8 w-8 items-center justify-center bg-accent shadow-lg">
              <svg width="12" height="12" viewBox="0 0 24 24" className="fill-[color:var(--on-accent)]">
                <polygon points="5,3 19,12 5,21" />
              </svg>
            </div>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-3">
        <p className="truncate text-sm font-semibold text-primary">{track?.title ?? "Unknown"}</p>
        <p className="mt-0.5 truncate text-xs text-secondary">{track?.artist ?? ""}</p>
      </div>
    </div>
  );
}

function StatusBadge({ status, step }: { status: string; step: string | null }) {
  if (status === "done") {
    return (
      <span className="bg-accent px-1.5 py-1 font-pixel text-[7px] text-on-accent">READY</span>
    );
  }
  if (status === "processing" || status === "pending") {
    return (
      <span className="flex items-center gap-1 bg-black/70 px-1.5 py-1 font-mono text-[10px] text-white backdrop-blur-sm">
        <Equalizer />
        {step ?? "processing"}
      </span>
    );
  }
  if (status === "failed") {
    return <span className="bg-red-600/80 px-1.5 py-1 font-pixel text-[7px] text-white">FAILED</span>;
  }
  return null;
}

function Equalizer() {
  return (
    <span className="inline-flex h-3 items-end gap-[2px]">
      <span className="w-[3px] animate-eq1 bg-accent" />
      <span className="w-[3px] animate-eq2 bg-accent" />
      <span className="w-[3px] animate-eq3 bg-accent" />
    </span>
  );
}

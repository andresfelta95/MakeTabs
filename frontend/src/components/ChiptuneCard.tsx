import { useNavigate } from "react-router-dom";
import type { LibraryCardJob } from "../types";

interface ChiptuneCardProps {
  job: LibraryCardJob;
  /** Extra control rendered over the art's top-left corner (e.g. save-to-folder). */
  topLeftAction?: React.ReactNode;
}

export default function ChiptuneCard({ job, topLeftAction }: ChiptuneCardProps) {
  const navigate = useNavigate();
  const track = job.track;

  const handleClick = () => {
    if (job.status === "done") navigate(`/chiptune/${job.job_id}`);
  };

  return (
    <div
      onClick={handleClick}
      role={job.status === "done" ? "button" : undefined}
      tabIndex={job.status === "done" ? 0 : undefined}
      onKeyDown={(e) => e.key === "Enter" && handleClick()}
      aria-label={job.status === "done" ? `Open 16-bit: ${track?.title ?? "song"}` : undefined}
      className={`group relative rounded-xl overflow-hidden bg-card border border-theme
                  transition-all duration-200 hover:scale-[1.02] hover:shadow-lg hover:border-chip/50
                  ${job.status === "done" ? "cursor-pointer" : "cursor-default"}`}
    >
      {/* Album art */}
      <div className="aspect-square relative overflow-hidden bg-card">
        {track?.image_url ? (
          <img
            src={track.image_url}
            alt={track.title}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105 filter saturate-50"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-chip/20 to-chip/5 flex items-center justify-center">
            <ChipIcon />
          </div>
        )}

        {/* Retro scanline overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
        <div className="absolute inset-0 opacity-10"
          style={{ backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.3) 2px, rgba(0,0,0,0.3) 4px)" }}
        />

        {/* Status badge */}
        <div className="absolute top-2 right-2">
          <ChipStatusBadge status={job.status} step={job.current_step} />
        </div>

        {topLeftAction && <div className="absolute top-2 left-2">{topLeftAction}</div>}

        {/* Play icon on hover */}
        {job.status === "done" && (
          <div className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <div className="w-9 h-9 rounded-full bg-chip flex items-center justify-center shadow-lg">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="white">
                <polygon points="5,3 19,12 5,21" />
              </svg>
            </div>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-3">
        <p className="text-sm font-semibold text-primary truncate">{track?.title ?? "Unknown"}</p>
        <p className="text-xs text-secondary truncate mt-0.5">{track?.artist ?? ""}</p>
      </div>
    </div>
  );
}

function ChipStatusBadge({ status, step }: { status: string; step: string | null }) {
  if (status === "done") {
    return (
      <span className="bg-chip text-white text-[10px] font-bold px-2 py-0.5 rounded-full font-mono tracking-wider">
        16-BIT
      </span>
    );
  }
  if (status === "processing" || status === "pending") {
    return (
      <span className="bg-black/60 backdrop-blur-sm text-white text-[10px] px-2 py-0.5 rounded-full flex items-center gap-1">
        <span className="inline-flex items-end gap-[2px] h-3">
          <span className="w-[3px] bg-chip rounded-full animate-eq1" />
          <span className="w-[3px] bg-chip rounded-full animate-eq2" />
          <span className="w-[3px] bg-chip rounded-full animate-eq3" />
        </span>
        {step ?? "processing"}
      </span>
    );
  }
  if (status === "failed") {
    return <span className="bg-red-600/80 text-white text-[10px] px-2 py-0.5 rounded-full">failed</span>;
  }
  return null;
}

function ChipIcon() {
  return (
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" className="text-chip/50">
      <rect x="7" y="7" width="10" height="10" rx="1" stroke="currentColor" strokeWidth="2"/>
      <line x1="9" y1="7" x2="9" y2="3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="12" y1="7" x2="12" y2="3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="15" y1="7" x2="15" y2="3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="9" y1="17" x2="9" y2="21" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="12" y1="17" x2="12" y2="21" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="15" y1="17" x2="15" y2="21" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="7" y1="9" x2="3" y2="9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="7" y1="12" x2="3" y2="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="7" y1="15" x2="3" y2="15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="17" y1="9" x2="21" y2="9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="17" y1="12" x2="21" y2="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="17" y1="15" x2="21" y2="15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}

import { useNavigate } from "react-router-dom";
import type { TabJob } from "../types";

interface TabCardProps {
  job: TabJob;
}

export default function TabCard({ job }: TabCardProps) {
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
      className={`group relative rounded-xl overflow-hidden bg-card border border-theme
                  transition-all duration-200 hover:scale-[1.02] hover:shadow-lg hover:border-accent/40
                  ${job.status === "done" ? "cursor-pointer" : "cursor-default"}`}
    >
      {/* Album art */}
      <div className="aspect-square relative overflow-hidden bg-card">
        {track?.image_url ? (
          <img
            src={track.image_url}
            alt={track.album ?? track.title}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-accent/20 to-accent/5 flex items-center justify-center">
            <MusicNoteIcon />
          </div>
        )}

        {/* Overlay gradient */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />

        {/* Status badge */}
        <div className="absolute top-2 right-2">
          <StatusBadge status={job.status} step={job.current_step} />
        </div>

        {/* Play button on hover */}
        {job.status === "done" && (
          <div className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <div className="w-9 h-9 rounded-full bg-accent flex items-center justify-center shadow-lg">
              <svg width="14" height="14" viewBox="0 0 24 24" className="fill-[color:var(--on-accent)]">
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

function StatusBadge({ status, step }: { status: string; step: string | null }) {
  if (status === "done") {
    return (
      <span className="bg-accent text-on-accent text-[10px] font-bold px-2 py-0.5 rounded-full font-mono tracking-wider">
        READY
      </span>
    );
  }
  if (status === "processing" || status === "pending") {
    return (
      <span className="bg-black/60 backdrop-blur-sm text-white text-[10px] px-2 py-0.5 rounded-full flex items-center gap-1">
        <Equalizer />
        {step ?? "processing"}
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span className="bg-red-600/80 text-white text-[10px] px-2 py-0.5 rounded-full">
        failed
      </span>
    );
  }
  return null;
}

function Equalizer() {
  return (
    <span className="inline-flex items-end gap-[2px] h-3">
      <span className="w-[3px] bg-accent rounded-full animate-eq1" />
      <span className="w-[3px] bg-accent rounded-full animate-eq2" />
      <span className="w-[3px] bg-accent rounded-full animate-eq3" />
    </span>
  );
}

function MusicNoteIcon() {
  return (
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" className="text-accent/40">
      <path
        d="M9 18V5l12-2v13"
        stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      />
      <circle cx="6" cy="18" r="3" stroke="currentColor" strokeWidth="2" />
      <circle cx="18" cy="16" r="3" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

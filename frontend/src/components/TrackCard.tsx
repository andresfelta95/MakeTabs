import type { CachedTabInfo, Track } from "../types";

interface TrackCardProps {
  track: Track;
  onGenerateTabs: (spotifyId: string) => void;
  isLoading?: boolean;
  tabInfo?: CachedTabInfo;
}

function formatDuration(ms: number | null): string {
  if (!ms) return "";
  const total = Math.round(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function TrackCard({ track, onGenerateTabs, isLoading, tabInfo }: TrackCardProps) {
  const hasCachedTab = tabInfo?.status === "done";

  return (
    <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg
                    hover:bg-spotify-card dark:hover:bg-spotify-card hover:bg-gray-100
                    transition-colors group">
      {track.image_url ? (
        <img
          src={track.image_url}
          alt={track.album ?? track.title}
          className="w-10 h-10 rounded-md object-cover flex-shrink-0"
        />
      ) : (
        <div className="w-10 h-10 rounded-md bg-gray-200 dark:bg-spotify-hover flex-shrink-0" />
      )}

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{track.title}</p>
        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
          {track.artist}{track.album && ` — ${track.album}`}
        </p>
      </div>

      <span className="text-xs text-gray-400 flex-shrink-0 hidden sm:block">
        {formatDuration(track.duration_ms)}
      </span>

      {hasCachedTab && (
        <span className="text-accent text-xs flex-shrink-0" title="Tab available">✓</span>
      )}

      <button
        onClick={() => onGenerateTabs(track.spotify_id)}
        disabled={isLoading}
        className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold
                   transition-all disabled:opacity-50 disabled:cursor-not-allowed
                   sm:opacity-0 sm:group-hover:opacity-100
                   ${hasCachedTab
                     ? "bg-accent text-black hover:scale-105 active:scale-95"
                     : "border border-accent text-accent hover:bg-accent hover:text-black"
                   }`}
      >
        {isLoading ? "…" : hasCachedTab ? "View Tab" : "Get Tabs"}
      </button>
    </div>
  );
}

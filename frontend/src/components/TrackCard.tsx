import type { Track } from "../types";

interface TrackCardProps {
  track: Track;
  onGenerateTabs: (spotifyId: string) => void;
  isLoading?: boolean;
}

function formatDuration(ms: number | null): string {
  if (!ms) return "";
  const total = Math.round(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function TrackCard({ track, onGenerateTabs, isLoading }: TrackCardProps) {
  return (
    <div className="flex items-center gap-4 p-3 rounded-lg hover:bg-spotify-card transition-colors group">
      {track.image_url ? (
        <img
          src={track.image_url}
          alt={track.album ?? track.title}
          className="w-12 h-12 rounded object-cover flex-shrink-0"
        />
      ) : (
        <div className="w-12 h-12 rounded bg-spotify-hover flex-shrink-0" />
      )}

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-white truncate">{track.title}</p>
        <p className="text-xs text-gray-400 truncate">
          {track.artist}
          {track.album && ` — ${track.album}`}
        </p>
      </div>

      <span className="text-xs text-gray-500 flex-shrink-0">
        {formatDuration(track.duration_ms)}
      </span>

      <button
        onClick={() => onGenerateTabs(track.spotify_id)}
        disabled={isLoading}
        className="flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold
                   bg-spotify-green text-black hover:scale-105 active:scale-95
                   transition-transform disabled:opacity-50 disabled:cursor-not-allowed
                   opacity-0 group-hover:opacity-100"
      >
        {isLoading ? "..." : "Get Tabs"}
      </button>
    </div>
  );
}

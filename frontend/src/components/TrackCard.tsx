import type { CachedTabInfo, Track } from "../types";

interface TrackCardProps {
  track: Track;
  onGenerateTabs: (spotifyId: string) => void;
  onGenerateChiptune?: (spotifyId: string) => void;
  isLoading?: boolean;
  chiptuneLoading?: boolean;
  tabInfo?: CachedTabInfo;
}

function formatDuration(ms: number | null): string {
  if (!ms) return "";
  const total = Math.round(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function TrackCard({ track, onGenerateTabs, onGenerateChiptune, isLoading, chiptuneLoading, tabInfo }: TrackCardProps) {
  const hasCachedTab = tabInfo?.status === "done";

  return (
    <div className="group flex items-center gap-3 rounded-xl border border-transparent px-3 py-2.5
                    transition-colors hover:border-theme hover:bg-card">
      {track.image_url ? (
        <img
          src={track.image_url}
          alt={track.album ?? track.title}
          className="h-11 w-11 flex-shrink-0 rounded-lg object-cover"
        />
      ) : (
        <div className="h-11 w-11 flex-shrink-0 rounded-lg bg-card-hover" />
      )}

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-primary">
          {track.title}
          {hasCachedTab && (
            <span className="ml-1.5 align-middle text-xs text-accent" title="Tab already generated">●</span>
          )}
        </p>
        <p className="truncate text-xs text-secondary">
          {track.artist}{track.album && ` — ${track.album}`}
        </p>
      </div>

      <span className="hidden flex-shrink-0 font-mono text-xs text-secondary sm:block">
        {formatDuration(track.duration_ms)}
      </span>

      {/* Actions — always visible so nobody has to discover a hover */}
      <div className="flex flex-shrink-0 gap-1.5">
        <button
          onClick={() => onGenerateTabs(track.spotify_id)}
          disabled={isLoading}
          title={hasCachedTab ? "Open the generated tab" : "Transcribe the guitar into tabs"}
          className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all
                     disabled:cursor-not-allowed disabled:opacity-50
                     ${hasCachedTab
                       ? "bg-accent text-on-accent hover:scale-105 active:scale-95"
                       : "border border-accent/60 text-accent hover:bg-accent hover:text-on-accent"
                     }`}
        >
          {isLoading ? "…" : hasCachedTab ? "▶ View tab" : "🎸 Tabs"}
        </button>

        {onGenerateChiptune && (
          <button
            onClick={() => onGenerateChiptune(track.spotify_id)}
            disabled={chiptuneLoading}
            title="Remake this song as a 16-bit chiptune"
            className="rounded-full border border-chip/60 px-3.5 py-1.5 text-xs font-semibold text-chip
                       transition-all hover:bg-chip hover:text-white
                       disabled:cursor-not-allowed disabled:opacity-50"
          >
            {chiptuneLoading ? "…" : "🕹️ 16-bit"}
          </button>
        )}
      </div>
    </div>
  );
}

import type { CachedTabInfo, Track } from "../types";
import PixelSprite from "./PixelSprite";
import { SPRITES } from "../lib/sprites";
import { Led } from "./pixel";

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

export default function TrackCard({
  track,
  onGenerateTabs,
  onGenerateChiptune,
  isLoading,
  chiptuneLoading,
  tabInfo,
}: TrackCardProps) {
  const hasCachedTab = tabInfo?.status === "done";

  return (
    <div
      className="group flex items-center gap-3 border border-transparent px-3 py-2.5
                 transition-colors hover:border-theme hover:bg-card"
    >
      {track.image_url ? (
        <img
          src={track.image_url}
          alt={track.album ?? track.title}
          className="h-11 w-11 flex-shrink-0 object-cover"
        />
      ) : (
        <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center bg-card-hover">
          <PixelSprite sprite={SPRITES.notes} className="h-5 w-5 text-secondary" />
        </div>
      )}

      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 truncate text-sm font-semibold text-primary">
          <span className="truncate">{track.title}</span>
          {hasCachedTab && (
            <span title="Tab already generated" className="shrink-0">
              <Led />
            </span>
          )}
        </p>
        <p className="truncate text-xs text-secondary">
          {track.artist}
          {track.album && ` — ${track.album}`}
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
          className={`flex items-center gap-1.5 border px-3 py-1.5 font-pixel text-[8px] transition-all
                     disabled:cursor-not-allowed disabled:opacity-50
                     ${
                       hasCachedTab
                         ? "border-accent bg-accent text-on-accent"
                         : "border-accent/60 text-accent hover:bg-accent hover:text-on-accent"
                     }`}
        >
          {isLoading ? (
            "…"
          ) : (
            <>
              <PixelSprite sprite={SPRITES.pick} className="h-3.5 w-3.5" />
              {hasCachedTab ? "View" : "Tabs"}
            </>
          )}
        </button>

        {onGenerateChiptune && (
          <button
            onClick={() => onGenerateChiptune(track.spotify_id)}
            disabled={chiptuneLoading}
            title="Remake this song as a 16-bit chiptune"
            className="flex items-center gap-1.5 border border-chip/60 px-3 py-1.5 font-pixel text-[8px] text-chip
                       transition-all hover:bg-chip hover:text-white
                       disabled:cursor-not-allowed disabled:opacity-50"
          >
            {chiptuneLoading ? (
              "…"
            ) : (
              <>
                <PixelSprite sprite={SPRITES.cart} className="h-3.5 w-3.5" />
                16-bit
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}

import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "../components/Layout";
import SearchBar from "../components/SearchBar";
import TrackCard from "../components/TrackCard";
import TabCard from "../components/TabCard";
import ChiptuneCard from "../components/ChiptuneCard";
import {
  useSearchTracks,
  useGenerateTabs,
  useGenerateChiptune,
  useTrackTabStatuses,
  useTabHistory,
  useChiptuneHistory,
} from "../hooks/useSpotify";

export default function Home() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [loadingTrackId, setLoadingTrackId] = useState<string | null>(null);
  const [chiptuneLoadingId, setChiptuneLoadingId] = useState<string | null>(null);
  const [chiptuneError, setChiptuneError] = useState<string | null>(null);

  const { data: searchResults } = useSearchTracks(searchQuery);
  const { data: history, isLoading: historyLoading } = useTabHistory();
  const { data: chiptuneHistory, isLoading: chiptuneHistoryLoading } = useChiptuneHistory();
  const generateTabs    = useGenerateTabs();
  const generateChiptune = useGenerateChiptune();

  const isSearching = searchQuery.length > 1;
  const tracks = searchResults?.items ?? [];
  const spotifyIds = tracks.map((t) => t.spotify_id);
  const { data: tabStatuses } = useTrackTabStatuses(spotifyIds);

  const handleSearch = useCallback((q: string) => setSearchQuery(q), []);

  const hasAnything =
    (history && history.length > 0) || (chiptuneHistory && chiptuneHistory.length > 0);

  const handleGenerateTabs = async (spotifyId: string) => {
    setLoadingTrackId(spotifyId);
    try {
      const job = await generateTabs.mutateAsync(spotifyId);
      navigate(`/tab/${job.job_id}`);
    } finally {
      setLoadingTrackId(null);
    }
  };

  const handleGenerateChiptune = async (spotifyId: string) => {
    setChiptuneLoadingId(spotifyId);
    setChiptuneError(null);
    try {
      const job = await generateChiptune.mutateAsync(spotifyId);
      navigate(`/chiptune/${job.job_id}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setChiptuneError(`Chiptune error: ${msg}`);
    } finally {
      setChiptuneLoadingId(null);
    }
  };

  return (
    <Layout>
      {/* Hero — search is THE action */}
      <div className={`mx-auto max-w-2xl text-center transition-all ${isSearching ? "mb-6" : "mb-10 pt-6 sm:pt-10"}`}>
        {!isSearching && (
          <>
            <h1 className="font-display text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">
              Any song →{" "}
              <span className="text-accent">guitar tabs</span>
              <span className="text-secondary"> & </span>
              <span className="text-chip">16-bit</span>
            </h1>
            <p className="mx-auto mt-3 max-w-md text-sm text-secondary sm:text-base">
              Search a track, pick a format, and the rig does the rest.
            </p>
          </>
        )}
        <div className={isSearching ? "" : "mt-6"}>
          <SearchBar onSearch={handleSearch} />
        </div>
      </div>

      {chiptuneError && (
        <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
          {chiptuneError}
        </div>
      )}

      {/* Search results */}
      {isSearching && (
        <section className="mb-10">
          <SectionHeader title={`Results for “${searchQuery}”`} count={tracks.length} />
          {tracks.length === 0 ? (
            <p className="py-8 text-center text-sm text-secondary">No songs found</p>
          ) : (
            <div className="mt-3 space-y-1">
              {tracks.map((track) => (
                <TrackCard
                  key={track.spotify_id}
                  track={track}
                  onGenerateTabs={handleGenerateTabs}
                  onGenerateChiptune={handleGenerateChiptune}
                  isLoading={loadingTrackId === track.spotify_id}
                  chiptuneLoading={chiptuneLoadingId === track.spotify_id}
                  tabInfo={tabStatuses?.[track.spotify_id]}
                />
              ))}
            </div>
          )}
        </section>
      )}

      {/* First-run: how it works */}
      {!isSearching && !historyLoading && !chiptuneHistoryLoading && !hasAnything && (
        <div className="mx-auto mb-12 grid max-w-3xl gap-3 sm:grid-cols-3">
          {[
            ["1", "Search", "Find any song on Spotify — title or artist."],
            ["2", "Pick a format", "🎸 Tabs transcribes the guitar. 🕹️ 16-bit remakes it as a chiptune."],
            ["3", "Play along", "Follow the tab with synced playback, or vibe to the 16-bit mix."],
          ].map(([n, title, body]) => (
            <div key={n} className="rounded-xl border border-theme bg-card p-4 text-left">
              <div className="font-display text-3xl font-extrabold text-accent/60">{n}</div>
              <p className="mt-1 font-semibold text-primary">{title}</p>
              <p className="mt-1 text-xs leading-relaxed text-secondary">{body}</p>
            </div>
          ))}
        </div>
      )}

      {/* My Tabs + 16-bit library */}
      {!isSearching && (
        <>
        <section>
          <SectionHeader
            title="My Tabs"
            count={history?.length}
            hint="Guitar transcriptions, ready to play along"
          />

          {historyLoading && <SkeletonGrid />}

          {!historyLoading && (!history || history.length === 0) && (
            <div className="py-12 text-center">
              <div className="mb-3 text-4xl">🎸</div>
              <p className="mb-1 font-semibold text-primary">No tabs yet</p>
              <p className="text-sm text-secondary">Search a song above and hit “Tabs”</p>
            </div>
          )}

          {!historyLoading && history && history.length > 0 && (
            <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {history.map((job) => (
                <TabCard key={job.job_id} job={job} />
              ))}
            </div>
          )}
        </section>

        {/* My 16-bit library */}
        <section className="mt-12">
          <SectionHeader
            title="My 16-bit"
            count={chiptuneHistory?.length}
            hint="Chiptune remakes — arcade-cab energy"
            variant="chip"
          />

          {chiptuneHistoryLoading && <SkeletonGrid />}

          {!chiptuneHistoryLoading && (!chiptuneHistory || chiptuneHistory.length === 0) && (
            <div className="py-10 text-center">
              <div className="mb-3 text-4xl">🕹️</div>
              <p className="mb-1 font-semibold text-primary">No 16-bit songs yet</p>
              <p className="text-sm text-secondary">Search a song above and hit “16-bit”</p>
            </div>
          )}

          {!chiptuneHistoryLoading && chiptuneHistory && chiptuneHistory.length > 0 && (
            <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {chiptuneHistory.map((job) => (
                <ChiptuneCard key={job.job_id} job={job} />
              ))}
            </div>
          )}
        </section>
        </>
      )}
    </Layout>
  );
}

function SectionHeader({
  title, count, hint, variant = "amber",
}: {
  title: string; count?: number; hint?: string; variant?: "amber" | "chip";
}) {
  return (
    <div className="mb-1">
      <div className="flex items-baseline gap-2.5">
        <h2 className="font-display text-2xl font-bold tracking-tight text-primary">{title}</h2>
        {typeof count === "number" && count > 0 && (
          <span className={`rounded-full px-2 py-0.5 font-mono text-[11px] font-semibold ${
            variant === "chip" ? "bg-chip/15 text-chip" : "bg-accent-soft text-accent"
          }`}>
            {count}
          </span>
        )}
      </div>
      {hint && <p className="mt-0.5 text-xs text-secondary">{hint}</p>}
      <div className={`mt-2 h-0.5 w-10 rounded-full ${variant === "chip" ? "bg-chip/60" : "bg-accent/60"}`} />
    </div>
  );
}

function SkeletonGrid() {
  return (
    <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
      {[...Array(5)].map((_, i) => (
        <div key={i} className="aspect-[3/4] animate-pulse rounded-xl bg-card" />
      ))}
    </div>
  );
}

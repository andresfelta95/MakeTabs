import { useCallback, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Layout from "../components/Layout";
import SearchBar from "../components/SearchBar";
import TrackCard from "../components/TrackCard";
import {
  useChiptuneHistory,
  useGenerateChiptune,
  useGenerateTabs,
  useSearchTracks,
  useTabHistory,
  useTrackTabStatuses,
} from "../hooks/useSpotify";

export default function Landing() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [loadingTrackId, setLoadingTrackId] = useState<string | null>(null);
  const [chiptuneLoadingId, setChiptuneLoadingId] = useState<string | null>(null);
  const [chiptuneError, setChiptuneError] = useState<string | null>(null);

  const { data: searchResults } = useSearchTracks(searchQuery);
  const { data: history } = useTabHistory();
  const { data: chiptuneHistory } = useChiptuneHistory();
  const generateTabs = useGenerateTabs();
  const generateChiptune = useGenerateChiptune();

  const isSearching = searchQuery.length > 1;
  const tracks = searchResults?.items ?? [];
  const spotifyIds = tracks.map((t) => t.spotify_id);
  const { data: tabStatuses } = useTrackTabStatuses(spotifyIds);

  const handleSearch = useCallback((q: string) => setSearchQuery(q), []);

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
          <div className="mb-1 flex items-baseline gap-2.5">
            <h2 className="font-display text-2xl font-bold tracking-tight text-primary">
              Results for “{searchQuery}”
            </h2>
            {tracks.length > 0 && (
              <span className="rounded-full bg-accent-soft px-2 py-0.5 font-mono text-[11px] font-semibold text-accent">
                {tracks.length}
              </span>
            )}
          </div>
          <div className="mb-3 h-0.5 w-10 rounded-full bg-accent/60" />
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

      {!isSearching && (
        <>
          {/* How it works */}
          <section className="mx-auto mb-10 max-w-3xl">
            <h2 className="mb-3 text-center font-display text-lg font-bold tracking-tight text-primary">
              How it works
            </h2>
            <div className="grid gap-3 sm:grid-cols-3">
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
          </section>

          {/* The two formats — doors into the libraries */}
          <section className="mx-auto grid max-w-3xl gap-4 sm:grid-cols-2">
            <FormatCard
              to="/tabs"
              emoji="🎸"
              title="Guitar Tabs"
              accent="accent"
              count={history?.length}
              body="Human-quality transcriptions (Songsterr-first) rendered as playable tabs with synced audio. Your whole collection, with filters and personal folders."
              cta="Open my Tabs"
            />
            <FormatCard
              to="/16bit"
              emoji="🕹️"
              title="16-bit"
              accent="chip"
              count={chiptuneHistory?.length}
              body="Every song remade as a chiptune — square-wave melody, sawtooth harmony, triangle bass, opt-in solo & drums. Arcade-cab energy, on demand."
              cta="Open my 16-bit"
            />
          </section>

          <p className="mt-10 text-center text-xs text-secondary">
            Everything you generate is saved to your libraries automatically — organize favorites into
            folders from the <span className="font-semibold">🎸 Tabs</span> and{" "}
            <span className="font-semibold">🕹️ 16-bit</span> pages.
          </p>
        </>
      )}
    </Layout>
  );
}

function FormatCard({
  to, emoji, title, body, cta, count, accent,
}: {
  to: string;
  emoji: string;
  title: string;
  body: string;
  cta: string;
  count?: number;
  accent: "accent" | "chip";
}) {
  const color = accent === "chip" ? "text-chip" : "text-accent";
  const border = accent === "chip" ? "hover:border-chip/50" : "hover:border-accent/40";
  const badge = accent === "chip" ? "bg-chip/15 text-chip" : "bg-accent-soft text-accent";
  return (
    <Link
      to={to}
      className={`group rounded-xl border border-theme bg-card p-5 transition-all duration-200 hover:scale-[1.01] hover:shadow-lg ${border}`}
    >
      <div className="flex items-center gap-2.5">
        <span className="text-2xl">{emoji}</span>
        <h3 className={`font-display text-xl font-extrabold tracking-tight ${color}`}>{title}</h3>
        {typeof count === "number" && count > 0 && (
          <span className={`rounded-full px-2 py-0.5 font-mono text-[11px] font-semibold ${badge}`}>
            {count}
          </span>
        )}
      </div>
      <p className="mt-2 text-sm leading-relaxed text-secondary">{body}</p>
      <p className={`mt-3 text-sm font-semibold ${color}`}>
        {cta} <span className="inline-block transition-transform group-hover:translate-x-0.5">→</span>
      </p>
    </Link>
  );
}

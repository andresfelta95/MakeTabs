import { useCallback, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Layout from "../components/Layout";
import SearchBar from "../components/SearchBar";
import TrackCard from "../components/TrackCard";
import PixelSprite from "../components/PixelSprite";
import PianoRollBackdrop from "../components/PianoRollBackdrop";
import { PixelHeading } from "../components/pixel";
import { SPRITES } from "../lib/sprites";
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
      <div className={`relative ${isSearching ? "mb-6" : "mb-12 pt-4 sm:pt-8"}`}>
        {!isSearching && (
          <>
            <PianoRollBackdrop
              seed={11}
              intensity={0.9}
              className="pointer-events-none absolute -inset-x-6 -top-8 bottom-0 -z-10"
            />
            <div
              aria-hidden
              className="pointer-events-none absolute -inset-x-6 -top-8 bottom-0 -z-10"
              style={{
                background:
                  "radial-gradient(34rem 18rem at 50% 45%, var(--bg-base) 30%, transparent 100%)",
              }}
            />
          </>
        )}

        <div className="mx-auto max-w-2xl text-center">
          {!isSearching && (
            <>
              <h1 className="pix-rise font-pixel text-base leading-[1.9] text-primary sm:text-xl">
                Any song →<br />
                <span className="text-accent">guitar tabs</span>
                <span className="text-secondary"> & </span>
                <span className="text-chip">16-bit</span>
              </h1>

              <div
                className="pix-rise mt-5 flex items-center justify-center gap-5 text-secondary"
                style={{ ["--rise-delay" as string]: "0.08s" }}
              >
                {/* Staggered so the three do not bob in lockstep. */}
                {[
                  { s: SPRITES.pick, c: "text-accent", d: "0s" },
                  { s: SPRITES.soundchip, c: "text-secondary", d: "0.25s" },
                  { s: SPRITES.cart, c: "text-chip", d: "0.5s" },
                ].map(({ s, c, d }, i) => (
                  <span
                    key={i}
                    className="pix-bob inline-flex"
                    style={{ ["--bob-delay" as string]: d }}
                  >
                    <PixelSprite sprite={s} className={`h-7 w-7 ${c}`} />
                  </span>
                ))}
              </div>

              <p
                className="pix-rise mx-auto mt-4 max-w-md text-sm text-secondary sm:text-base"
                style={{ ["--rise-delay" as string]: "0.14s" }}
              >
                Search a track, pick a format, and the rig does the rest.
              </p>
            </>
          )}
          <div className={isSearching ? "" : "pix-rise mt-7"} style={{ ["--rise-delay" as string]: "0.2s" }}>
            <SearchBar onSearch={handleSearch} />
          </div>
        </div>
      </div>

      {chiptuneError && (
        <div className="mb-4 border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
          {chiptuneError}
        </div>
      )}

      {/* Search results */}
      {isSearching && (
        <section className="mb-10">
          <PixelHeading
            title={`Results — ${searchQuery}`}
            sprite={SPRITES.magnifier}
            count={tracks.length}
          />
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
          {/* How it works — three racked units */}
          <section className="mx-auto mb-10 max-w-3xl">
            <h2 className="mb-4 text-center font-pixel text-[11px] text-secondary">How it works</h2>
            <div className="grid gap-3 sm:grid-cols-3">
              {[
                ["01", "Search", "Find any song on Spotify — title or artist.", SPRITES.magnifier],
                ["02", "Pick a format", "Tabs transcribes the guitar. 16-bit remakes it as a chiptune.", SPRITES.soundchip],
                ["03", "Play along", "Follow the tab with synced playback, or vibe to the 16-bit mix.", SPRITES.notes],
              ].map(([n, title, body, sprite]) => (
                <div
                  key={n as string}
                  className="relative border border-theme bg-card p-4 text-left"
                >
                  <span
                    aria-hidden
                    className="absolute left-0 top-0 h-2 w-2 border-l border-t border-accent opacity-60"
                  />
                  <div className="mb-2 flex items-center justify-between">
                    <PixelSprite
                      sprite={sprite as (typeof SPRITES)[keyof typeof SPRITES]}
                      className="h-6 w-6 text-accent"
                    />
                    <span className="font-pixel text-[11px] text-accent opacity-50">
                      {n as string}
                    </span>
                  </div>
                  <p className="font-pixel text-[10px] text-primary">{title as string}</p>
                  <p className="mt-2 text-xs leading-relaxed text-secondary">{body as string}</p>
                </div>
              ))}
            </div>
          </section>

          {/* The two formats — doors into the libraries */}
          <section className="mx-auto grid max-w-3xl gap-4 sm:grid-cols-2">
            <FormatCard
              to="/tabs"
              sprite={SPRITES.pick}
              title="Guitar Tabs"
              accent="accent"
              count={history?.length}
              body="Human-quality transcriptions (Songsterr-first) rendered as playable tabs with synced audio. Your whole collection, with filters and personal folders."
              cta="Open my Tabs"
            />
            <FormatCard
              to="/16bit"
              sprite={SPRITES.cart}
              title="16-bit"
              accent="chip"
              count={chiptuneHistory?.length}
              body="Every song remade as a chiptune — square melody, sawtooth harmony, triangle bass, opt-in solo & drums. Arcade-cab energy, on demand."
              cta="Open my 16-bit"
            />
          </section>

          <p className="mt-10 text-center text-xs text-secondary">
            Everything you generate is saved to your libraries automatically — organize favorites
            into folders from the <span className="font-semibold text-accent">Tabs</span> and{" "}
            <span className="font-semibold text-chip">16-bit</span> pages.
          </p>
        </>
      )}
    </Layout>
  );
}

function FormatCard({
  to,
  sprite,
  title,
  body,
  cta,
  count,
  accent,
}: {
  to: string;
  sprite: (typeof SPRITES)[keyof typeof SPRITES];
  title: string;
  body: string;
  cta: string;
  count?: number;
  accent: "accent" | "chip";
}) {
  const color = accent === "chip" ? "text-chip" : "text-accent";
  const border = accent === "chip" ? "hover:border-chip/50" : "hover:border-accent/50";
  const bracket = accent === "chip" ? "border-chip" : "border-accent";
  const glow = accent === "chip" ? "pix-glow-chip" : "pix-glow";

  return (
    <Link
      to={to}
      className={`group relative border border-theme bg-card p-5 transition-colors ${border}`}
    >
      <span
        aria-hidden
        className={`absolute left-0 top-0 h-2.5 w-2.5 border-l border-t ${bracket} opacity-70`}
      />
      <span
        aria-hidden
        className={`absolute bottom-0 right-0 h-2.5 w-2.5 border-b border-r ${bracket} opacity-70`}
      />
      <div className="flex items-center gap-3">
        <PixelSprite sprite={sprite} className={`h-8 w-8 shrink-0 ${color} ${glow}`} />
        <h3 className={`font-pixel text-[12px] ${color}`}>{title}</h3>
        {typeof count === "number" && count > 0 && (
          <span className={`ml-auto border border-theme px-1.5 py-0.5 font-mono text-[10px] ${color}`}>
            {count}
          </span>
        )}
      </div>
      <p className="mt-3 text-sm leading-relaxed text-secondary">{body}</p>
      <p className={`mt-3 font-pixel text-[9px] ${color}`}>
        {cta} <span className="inline-block transition-transform group-hover:translate-x-0.5">→</span>
      </p>
    </Link>
  );
}

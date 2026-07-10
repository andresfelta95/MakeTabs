import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Layout from "./Layout";
import FolderBar from "./FolderBar";
import SaveToFolderButton from "./SaveToFolderButton";
import TabCard from "./TabCard";
import ChiptuneCard from "./ChiptuneCard";
import { useFolder } from "../hooks/useFolders";
import type { FolderItemType, LibraryCardJob } from "../types";

type SortKey = "recent" | "title" | "artist";

interface LibraryViewProps {
  kind: FolderItemType;
  title: string;
  hint: string;
  emptyEmoji: string;
  accent: "accent" | "chip";
  jobs: LibraryCardJob[] | undefined;
  isLoading: boolean;
}

/**
 * Shared library page for /tabs and /16bit: folder chips, filter bar
 * (search / artist / sort), and the card grid.
 */
export default function LibraryView({
  kind, title, hint, emptyEmoji, accent, jobs, isLoading,
}: LibraryViewProps) {
  const [folderId, setFolderId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [artist, setArtist] = useState("");
  const [sort, setSort] = useState<SortKey>("recent");

  const { data: folder, isLoading: folderLoading } = useFolder(folderId, kind);

  // Source list: the whole library, or the selected folder's songs
  const entries: LibraryCardJob[] = useMemo(() => {
    if (folderId) {
      return (folder?.items ?? []).map((item) => ({
        job_id: item.job_id ?? "",
        status: item.job_status ?? "failed",
        current_step: null,
        track: item.track,
      }));
    }
    return jobs ?? [];
  }, [folderId, folder, jobs]);

  const artists = useMemo(() => {
    const names = new Set<string>();
    for (const e of entries) if (e.track?.artist) names.add(e.track.artist);
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [entries]);

  const filtered = useMemo(() => {
    let list = entries;
    if (artist) {
      list = list.filter((e) => e.track?.artist === artist);
    }
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (e) =>
          e.track?.title.toLowerCase().includes(q) ||
          e.track?.artist.toLowerCase().includes(q)
      );
    }
    if (sort === "title") {
      list = [...list].sort((a, b) => (a.track?.title ?? "").localeCompare(b.track?.title ?? ""));
    } else if (sort === "artist") {
      list = [...list].sort(
        (a, b) =>
          (a.track?.artist ?? "").localeCompare(b.track?.artist ?? "") ||
          (a.track?.title ?? "").localeCompare(b.track?.title ?? "")
      );
    }
    // "recent" keeps the source order: history and folder items both arrive newest-first
    return list;
  }, [entries, search, artist, sort]);

  const loading = folderId ? folderLoading : isLoading;
  const libraryEmpty = !isLoading && (!jobs || jobs.length === 0);
  const color = accent === "chip" ? "text-chip" : "text-accent";
  const underline = accent === "chip" ? "bg-chip/60" : "bg-accent/60";
  const focusBorder = accent === "chip" ? "focus:border-chip/60" : "focus:border-accent/60";

  return (
    <Layout>
      <div className="mb-5">
        <h1 className="font-display text-3xl font-extrabold tracking-tight text-primary">
          {title}
        </h1>
        <p className="mt-0.5 text-sm text-secondary">{hint}</p>
        <div className={`mt-2 h-0.5 w-10 rounded-full ${underline}`} />
      </div>

      {/* Empty library: point back to the generator */}
      {libraryEmpty ? (
        <div className="py-16 text-center">
          <div className="mb-3 text-4xl">{emptyEmoji}</div>
          <p className="mb-1 font-semibold text-primary">Nothing here yet</p>
          <p className="text-sm text-secondary">
            <Link to="/" className={`font-semibold ${color} hover:underline`}>
              Search a song
            </Link>{" "}
            and generate your first one.
          </p>
        </div>
      ) : (
        <>
          <div className="mb-4">
            <FolderBar
              kind={kind}
              totalCount={jobs?.length ?? 0}
              selectedId={folderId}
              onSelect={(id) => setFolderId(id)}
              accent={accent}
            />
          </div>

          {/* Filter bar */}
          <div className="mb-5 flex flex-wrap items-center gap-2">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter by title or band…"
              aria-label="Filter songs"
              className={`w-52 rounded-full border border-theme bg-card px-4 py-1.5 text-sm text-primary placeholder:text-secondary focus:outline-none ${focusBorder}`}
            />
            <select
              value={artist}
              onChange={(e) => setArtist(e.target.value)}
              aria-label="Filter by band"
              className={`rounded-full border border-theme bg-card px-3 py-1.5 text-sm text-primary focus:outline-none ${focusBorder}`}
            >
              <option value="">All bands</option>
              {artists.map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              aria-label="Sort songs"
              className={`rounded-full border border-theme bg-card px-3 py-1.5 text-sm text-primary focus:outline-none ${focusBorder}`}
            >
              <option value="recent">Newest first</option>
              <option value="title">Title A–Z</option>
              <option value="artist">Band A–Z</option>
            </select>
            <span className="ml-auto font-mono text-xs text-secondary">
              {filtered.length} {filtered.length === 1 ? "song" : "songs"}
            </span>
          </div>

          {loading && <SkeletonGrid />}

          {!loading && filtered.length === 0 && (
            <div className="py-14 text-center">
              <p className="mb-1 font-semibold text-primary">
                {folderId && entries.length === 0 ? "This folder is empty" : "No songs match"}
              </p>
              <p className="text-sm text-secondary">
                {folderId && entries.length === 0
                  ? "Use the bookmark on any song card to save it here."
                  : "Try a different filter or clear the search."}
              </p>
            </div>
          )}

          {!loading && filtered.length > 0 && (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {filtered.map((job) => {
                const save = job.track ? (
                  <SaveToFolderButton spotifyId={job.track.spotify_id} itemType={kind} />
                ) : undefined;
                return kind === "tab" ? (
                  <TabCard key={job.job_id || job.track?.spotify_id} job={job} topLeftAction={save} />
                ) : (
                  <ChiptuneCard key={job.job_id || job.track?.spotify_id} job={job} topLeftAction={save} />
                );
              })}
            </div>
          )}
        </>
      )}
    </Layout>
  );
}

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
      {[...Array(5)].map((_, i) => (
        <div key={i} className="aspect-[3/4] animate-pulse rounded-xl bg-card" />
      ))}
    </div>
  );
}

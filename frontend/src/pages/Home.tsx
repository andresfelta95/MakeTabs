import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "../components/Layout";
import SearchBar from "../components/SearchBar";
import TrackCard from "../components/TrackCard";
import TabCard from "../components/TabCard";
import {
  useSearchTracks,
  useGenerateTabs,
  useGenerateChiptune,
  useTrackTabStatuses,
  useTabHistory,
} from "../hooks/useSpotify";

export default function Home() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [loadingTrackId, setLoadingTrackId] = useState<string | null>(null);
  const [chiptuneLoadingId, setChiptuneLoadingId] = useState<string | null>(null);

  const { data: searchResults } = useSearchTracks(searchQuery);
  const { data: history, isLoading: historyLoading } = useTabHistory();
  const generateTabs    = useGenerateTabs();
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
      navigate(`/tabs/${job.job_id}`);
    } finally {
      setLoadingTrackId(null);
    }
  };

  const handleGenerateChiptune = async (spotifyId: string) => {
    setChiptuneLoadingId(spotifyId);
    try {
      const job = await generateChiptune.mutateAsync(spotifyId);
      navigate(`/chiptune/${job.job_id}`);
    } finally {
      setChiptuneLoadingId(null);
    }
  };

  return (
    <Layout>
      {/* Search */}
      <div className="mb-8">
        <SearchBar onSearch={handleSearch} />
      </div>

      {/* Search results */}
      {isSearching && (
        <section className="mb-10">
          <SectionHeader icon="🔍" title={`Results for "${searchQuery}"`} />
          {tracks.length === 0 ? (
            <p className="text-secondary text-sm py-8 text-center">No songs found</p>
          ) : (
            <div className="space-y-1 mt-3">
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

      {/* My Tabs library */}
      {!isSearching && (
        <section>
          <SectionHeader icon="🎸" title="My Tabs" />

          {historyLoading && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 mt-4">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="rounded-xl bg-card animate-pulse aspect-[3/4]" />
              ))}
            </div>
          )}

          {!historyLoading && (!history || history.length === 0) && (
            <div className="text-center py-16">
              <div className="text-5xl mb-4">🎵</div>
              <p className="text-primary font-semibold mb-1">No tabs yet</p>
              <p className="text-secondary text-sm">Search for a song above to generate your first tab</p>
            </div>
          )}

          {!historyLoading && history && history.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 mt-4">
              {history.map((job) => (
                <TabCard key={job.job_id} job={job} />
              ))}
            </div>
          )}
        </section>
      )}
    </Layout>
  );
}

function SectionHeader({ icon, title }: { icon: string; title: string }) {
  return (
    <div className="flex items-center gap-2 mb-1">
      <span className="text-lg">{icon}</span>
      <h2 className="text-base font-bold text-primary tracking-tight">{title}</h2>
    </div>
  );
}

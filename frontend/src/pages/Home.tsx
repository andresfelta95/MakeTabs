import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "../components/Layout";
import SearchBar from "../components/SearchBar";
import PlaylistList from "../components/PlaylistList";
import TrackCard from "../components/TrackCard";
import { usePlaylists, usePlaylistTracks, useSearchTracks, useGenerateTabs, useTrackTabStatuses } from "../hooks/useSpotify";

export default function Home() {
  const navigate = useNavigate();
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [loadingTrackId, setLoadingTrackId] = useState<string | null>(null);

  const { data: playlists, isLoading: playlistsLoading } = usePlaylists();
  const { data: playlistTracks } = usePlaylistTracks(selectedPlaylistId);
  const { data: searchResults } = useSearchTracks(searchQuery);
  const generateTabs = useGenerateTabs();

  const isSearching = searchQuery.length > 1;
  const tracks = isSearching ? searchResults?.items : playlistTracks?.items;

  const spotifyIds = (tracks ?? []).map((t) => t.spotify_id);
  const { data: tabStatuses } = useTrackTabStatuses(spotifyIds);

  const handleSearch = useCallback((q: string) => {
    setSearchQuery(q);
    if (q) setSelectedPlaylistId(null);
  }, []);

  const handleGenerateTabs = async (spotifyId: string) => {
    setLoadingTrackId(spotifyId);
    try {
      const job = await generateTabs.mutateAsync(spotifyId);
      navigate(`/tabs/${job.job_id}`);
    } finally {
      setLoadingTrackId(null);
    }
  };

  return (
    <Layout>
      <div className="mb-6">
        <SearchBar onSearch={handleSearch} />
      </div>

      <div className="flex gap-6">
        {/* Sidebar — playlists */}
        {!isSearching && (
          <aside className="w-64 flex-shrink-0">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
              Your Playlists
            </h2>
            {playlistsLoading ? (
              <div className="space-y-2">
                {[...Array(6)].map((_, i) => (
                  <div key={i} className="h-14 rounded-lg bg-spotify-card animate-pulse" />
                ))}
              </div>
            ) : (
              <PlaylistList
                playlists={playlists?.items ?? []}
                selectedId={selectedPlaylistId}
                onSelect={setSelectedPlaylistId}
              />
            )}
          </aside>
        )}

        {/* Main — tracks */}
        <div className="flex-1 min-w-0">
          {isSearching && (
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
              Search results for "{searchQuery}"
            </h2>
          )}
          {!isSearching && selectedPlaylistId && (
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
              Tracks
            </h2>
          )}
          {!isSearching && !selectedPlaylistId && (
            <div className="text-center py-20 text-gray-600">
              <p>Search for a song to generate guitar tabs</p>
            </div>
          )}
          {!isSearching && selectedPlaylistId && tracks && tracks.length === 0 && (
            <div className="text-center py-20 text-gray-500">
              <p className="text-sm">Playlist tracks unavailable</p>
              <p className="text-xs mt-1 text-gray-600">Use the search bar instead</p>
            </div>
          )}

          {tracks && tracks.length > 0 && (
            <div className="space-y-1">
              {tracks.map((track) => (
                <TrackCard
                  key={track.spotify_id}
                  track={track}
                  onGenerateTabs={handleGenerateTabs}
                  isLoading={loadingTrackId === track.spotify_id}
                  tabInfo={tabStatuses?.[track.spotify_id]}
                />
              ))}
            </div>
          )}

          {tracks && tracks.length === 0 && (
            <p className="text-gray-500 text-sm py-10 text-center">No tracks found</p>
          )}
        </div>
      </div>
    </Layout>
  );
}

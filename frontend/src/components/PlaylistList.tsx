import type { Playlist } from "../types";

interface PlaylistListProps {
  playlists: Playlist[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export default function PlaylistList({ playlists, selectedId, onSelect }: PlaylistListProps) {
  return (
    <div className="space-y-1">
      {playlists.map((playlist) => (
        <button
          key={playlist.id}
          onClick={() => onSelect(playlist.id)}
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors
            ${selectedId === playlist.id
              ? "bg-spotify-card text-white"
              : "text-gray-400 hover:text-white hover:bg-white/5"
            }`}
        >
          {playlist.image_url ? (
            <img
              src={playlist.image_url}
              alt={playlist.name}
              className="w-10 h-10 rounded object-cover flex-shrink-0"
            />
          ) : (
            <div className="w-10 h-10 rounded bg-spotify-hover flex-shrink-0" />
          )}
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">{playlist.name}</p>
            <p className="text-xs text-gray-500">{playlist.track_count} tracks</p>
          </div>
        </button>
      ))}
    </div>
  );
}

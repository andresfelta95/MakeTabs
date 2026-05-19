import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getPlaylists,
  getPlaylistTracks,
  searchTracks,
  generateTabs,
  getTabJob,
} from "../api/spotify";

export function usePlaylists(limit = 20, offset = 0) {
  return useQuery({
    queryKey: ["playlists", limit, offset],
    queryFn: () => getPlaylists(limit, offset),
  });
}

export function usePlaylistTracks(playlistId: string | null, limit = 20, offset = 0) {
  return useQuery({
    queryKey: ["playlist-tracks", playlistId, limit, offset],
    queryFn: () => getPlaylistTracks(playlistId!, limit, offset),
    enabled: !!playlistId,
  });
}

export function useSearchTracks(query: string, limit = 20, offset = 0) {
  return useQuery({
    queryKey: ["search", query, limit, offset],
    queryFn: () => searchTracks(query, limit, offset),
    enabled: query.length > 1,
  });
}

export function useTabJob(jobId: string | null) {
  return useQuery({
    queryKey: ["tab-job", jobId],
    queryFn: () => getTabJob(jobId!),
    enabled: !!jobId,
    // Poll every 2 seconds while job is pending/processing
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === "pending" || status === "processing" ? 2000 : false;
    },
  });
}

export function useGenerateTabs() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: generateTabs,
    onSuccess: (data) => {
      queryClient.setQueryData(["tab-job", data.job_id], data);
    },
  });
}

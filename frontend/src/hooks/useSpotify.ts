import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getPlaylists,
  getPlaylistTracks,
  searchTracks,
  generateTabs,
  getTabJob,
  getTabStatuses,
  getTabHistory,
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
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === "pending" || status === "processing" ? 2000 : false;
    },
    refetchIntervalInBackground: true,
  });
}

export function useTrackTabStatuses(spotifyIds: string[]) {
  const key = spotifyIds.slice().sort().join(",");
  return useQuery({
    queryKey: ["tab-statuses", key],
    queryFn: () => getTabStatuses(spotifyIds),
    enabled: spotifyIds.length > 0,
    staleTime: 10_000,
  });
}

export function useGenerateTabs() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: generateTabs,
    onSuccess: (data) => {
      queryClient.setQueryData(["tab-job", data.job_id], data);
      queryClient.invalidateQueries({ queryKey: ["tab-statuses"] });
      queryClient.invalidateQueries({ queryKey: ["tab-history"] });
    },
  });
}

export function useTabHistory() {
  return useQuery({
    queryKey: ["tab-history"],
    queryFn: getTabHistory,
    staleTime: 30_000,
    refetchInterval: (query) => {
      const jobs = query.state.data ?? [];
      const hasActive = jobs.some(j => j.status === "pending" || j.status === "processing");
      return hasActive ? 3000 : false;
    },
    refetchIntervalInBackground: true,
  });
}

import client from "./client";
import type { PaginatedPlaylists, PaginatedTracks, TabJob } from "../types";

export const getPlaylists = async (limit = 20, offset = 0): Promise<PaginatedPlaylists> => {
  const { data } = await client.get<PaginatedPlaylists>("/spotify/playlists", {
    params: { limit, offset },
  });
  return data;
};

export const getPlaylistTracks = async (
  playlistId: string,
  limit = 20,
  offset = 0
): Promise<PaginatedTracks> => {
  const { data } = await client.get<PaginatedTracks>(
    `/spotify/playlists/${playlistId}/tracks`,
    { params: { limit, offset } }
  );
  return data;
};

export const searchTracks = async (
  q: string,
  limit = 20,
  offset = 0
): Promise<PaginatedTracks> => {
  const { data } = await client.get<PaginatedTracks>("/spotify/search", {
    params: { q, limit, offset },
  });
  return data;
};

export const generateTabs = async (spotifyTrackId: string): Promise<TabJob> => {
  const { data } = await client.post<TabJob>("/tabs/generate", {
    spotify_track_id: spotifyTrackId,
  });
  return data;
};

export const getTabJob = async (jobId: string): Promise<TabJob> => {
  const { data } = await client.get<TabJob>(`/tabs/${jobId}`);
  return data;
};

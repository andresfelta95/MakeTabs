export interface User {
  id: string;
  spotify_id: string;
  display_name: string | null;
  email: string | null;
  created_at: string;
}

export interface Track {
  spotify_id: string;
  title: string;
  artist: string;
  album: string | null;
  duration_ms: number | null;
  preview_url: string | null;
  image_url: string | null;
  has_guitar: boolean | null;
}

export interface Playlist {
  id: string;
  name: string;
  track_count: number;
  image_url: string | null;
}

export interface PaginatedPlaylists {
  items: Playlist[];
  total: number;
  limit: number;
  offset: number;
}

export interface PaginatedTracks {
  items: Track[];
  total: number;
  limit?: number;
  offset?: number;
}

export type TabStatus = "pending" | "processing" | "done" | "failed";

export interface TabNote {
  string: number;
  fret: number;
  time: number;
  duration: number;
}

export interface TabMeasure {
  notes: TabNote[];
}

export interface TabSection {
  name: string;
  measures: TabMeasure[];
}

export interface TabData {
  tuning: string[];
  bpm: number;
  sections: TabSection[];
}

export interface TabJob {
  job_id: string;
  status: TabStatus;
  has_guitar: boolean | null;
  tab_data: TabData | null;
  error: string | null;
  track: Track | null;
  created_at: string;
  completed_at: string | null;
}

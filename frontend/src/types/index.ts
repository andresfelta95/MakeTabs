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
  beat?: number;
}

export interface TabMeasure {
  notes: TabNote[];
}

export interface TabSection {
  name: string;
  lyrics_section?: number;
  measures: TabMeasure[];
}

export interface LyricsSection {
  name: string;
  text: string;
}

export interface GuitarTab {
  name: string;
  sections: TabSection[];
}

export interface TabData {
  tuning: string[];
  bpm: number;
  // v1 schema
  sections?: TabSection[];
  // v2 schema
  guitars?: GuitarTab[];
  lyrics_sections?: LyricsSection[];
}

export interface TabJob {
  job_id: string;
  status: TabStatus;
  current_step: string | null;
  has_guitar: boolean | null;
  tab_data: TabData | null;
  error: string | null;
  track: Track | null;
  created_at: string;
  completed_at: string | null;
}

export interface CachedTabInfo {
  status: TabStatus;
  job_id: string;
}

export type TabStatusMap = Record<string, CachedTabInfo>;

// ── Chiptune types ────────────────────────────────────────────────────────────

export interface ChiptuneNote {
  pitch: number; // MIDI note number
  beat: number;  // 0–7 (eighth-note slot)
}

export interface ChiptuneMeasure {
  notes: ChiptuneNote[];
}

export interface ChiptuneSection {
  name: string;
  measures: ChiptuneMeasure[];
}

export interface DrumEvent {
  measure: number;
  beat: number;
  type: "kick" | "snare" | "hihat";
}

export interface ChiptuneTonalTrack {
  waveform: "square" | "triangle" | "pulse" | "sawtooth";
  sections: ChiptuneSection[];
}

export interface ChiptuneDrumTrack {
  waveform: "noise";
  patterns: DrumEvent[];
}

export interface ChiptuneData {
  bpm: number;
  tracks: {
    melody: ChiptuneTonalTrack;
    bass: ChiptuneTonalTrack;
    drums: ChiptuneDrumTrack;
  };
}

export interface ChiptuneJob {
  job_id: string;
  status: TabStatus;
  current_step: string | null;
  chiptune_data: ChiptuneData | null;
  error: string | null;
  track: Track | null;
  created_at: string;
  completed_at: string | null;
}

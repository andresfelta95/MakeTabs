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
  duration?: number; // in beat slots (1 = eighth note, 2 = quarter, 4 = half, 8 = whole)
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

export interface AccompanimentNote {
  t: number; // absolute time, seconds
  p: number; // MIDI pitch (or GM percussion note for drums)
  d: number; // duration, seconds
}

export interface AccompanimentTrack {
  kind: "bass" | "piano" | "drums" | "other";
  name: string;
  notes: AccompanimentNote[];
}

export interface TabData {
  tuning: string[];
  bpm: number;
  // v1 schema
  sections?: TabSection[];
  // v2 schema
  guitars?: GuitarTab[];
  lyrics_sections?: LyricsSection[];
  // v4.4: pre-computed bass/piano/drums for the oscillator player. Not shown
  // visually — purely additional sound layered into the synth playback.
  accompaniment?: AccompanimentTrack[];
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

/** The subset of a job that library cards need — TabJob and ChiptuneJob both satisfy it. */
export interface LibraryCardJob {
  job_id: string;
  status: TabStatus;
  current_step: string | null;
  track: Track | null;
}

export interface CachedTabInfo {
  status: TabStatus;
  job_id: string;
}

export type TabStatusMap = Record<string, CachedTabInfo>;

// ── Chiptune types ────────────────────────────────────────────────────────────

export interface ChiptuneNote {
  pitch: number; // MIDI note number
  beat: number;  // 0–15 (sixteenth-note slot within measure)
  dur?: number;  // duration in beat slots (e.g. 2 = two slots)
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
    harmony?: ChiptuneTonalTrack;
    /** Dedicated solo/lead voice (lead guitar). Absent on jobs generated before
     *  the solo voice existed. */
    lead?: ChiptuneTonalTrack;
    bass: ChiptuneTonalTrack;
    drums: ChiptuneDrumTrack;
  };
}

// ── Folder types ──────────────────────────────────────────────────────────────

export type FolderItemType = "tab" | "chiptune";

export interface Folder {
  id: string;
  name: string;
  created_at: string;
  tab_count: number;
  chiptune_count: number;
}

export interface FolderItem {
  id: string;
  item_type: FolderItemType;
  added_at: string;
  track: Track;
  job_id: string | null;
  job_status: TabStatus | null;
}

export interface FolderDetail {
  id: string;
  name: string;
  created_at: string;
  items: FolderItem[];
}

/** spotify_track_id → ids of folders containing that song (for one format) */
export type FolderMembershipMap = Record<string, string[]>;

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

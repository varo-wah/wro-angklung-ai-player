import type { SongPerformanceProfile } from "./songPerformanceProfiles";
export type ArrangementNoteRole = "melody" | "accompaniment" | "support" | string;

export type SongCatalogEntry = {
  id: string;
  title: string;
  aliases?: string[];
  category?: string;
  difficulty?: string;
  priority?: string;
  verdict?: string;
  reason?: string;
  arrangement_status?: string;
  playable?: boolean;
  demo_safe?: boolean;
  has_validated_notes?: boolean;
  active?: boolean;
  visible_in_guest?: boolean;
  physical_rack_map?: string;
  melody_register?: string;
  melody_target_range?: string;
  accompaniment_register?: string;
  accompaniment_target_range?: string;
  path: string;
};

export type ArrangementNote = {
  note: string;
  beat?: number;
  duration_beats?: number;
  start?: number;
  duration?: number;
  role?: ArrangementNoteRole;
  register?: string;
  track?: string;
  source_track?: string;
  velocity?: number;
  /** Musical strength relative to motor calibration; omitted means 1. */
  playback_strength_multiplier?: number;
  /** Motor articulation only; omitted means full scored duration. */
  playback_duration_multiplier?: number;
};

export type ArrangementTrack = {
  role: ArrangementNoteRole;
  register?: string;
  notes: ArrangementNote[];
};

export type AngklungArrangement = {
  format_version?: string;
  id: string;
  title: string;
  aliases?: string[];
  category?: string;
  difficulty?: string;
  arrangement_status?: string;
  playable?: boolean;
  demo_safe?: boolean;
  has_validated_notes?: boolean;
  rack_map?: string;
  physical_rack_map?: string;
  tempo_bpm: number;
  time_signature?: string;
  notes?: ArrangementNote[];
  tracks?: ArrangementTrack[];
  metadata?: unknown;
  arrangement_policy?: {
    physical_rack_map?: string;
    melody_register?: string;
    melody_target_range?: string;
    accompaniment_register?: string;
    accompaniment_target_range?: string;
    [key: string]: unknown;
  };
};

export type SongNote = {
  note: string;
  start: number;
  duration: number;
  register?: string;
  role?: ArrangementNoteRole;
  sourceTrack?: string;
  playback_strength_multiplier?: number;
  /** Motor articulation only; omitted means full scored duration. */
  playback_duration_multiplier?: number;
};

export type LoadedSong = {
  performance_profile?: SongPerformanceProfile;
  id: string;
  title: string;
  aliases?: string[];
  arrangement_status?: string;
  category?: string;
  demo_safe?: boolean;
  difficulty?: string;
  has_validated_notes?: boolean;
  active?: boolean;
  physical_rack_map?: string;
  melody_register?: string;
  melody_target_range?: string;
  accompaniment_register?: string;
  accompaniment_target_range?: string;
  playable?: boolean;
  priority?: string;
  reason?: string;
  source_path?: string;
  tempo_bpm: number;
  time_signature?: string;
  verdict?: string;
  notes: SongNote[];
};

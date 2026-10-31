import type { LoadedSong, SongCatalogEntry } from "../../../lib/songTypes";
import type { ActuatorCommand, ActuatorSchedule } from "../../../lib/types";

/** Replace these adapters when packaging Studio for another platform. */
export interface SongRepository {
  loadCatalog(): Promise<SongCatalogEntry[]>;
  loadSong(entry: SongCatalogEntry): Promise<LoadedSong>;
}

export interface PreferenceStore {
  load(): unknown;
  save(preferences: StudioPreferences): void;
}

export interface PreviewAudio {
  ensureReady(): Promise<void>;
  playNote(note: string, durationSeconds: number, strength: number): void;
  setMuted(muted: boolean): void;
  stopAll(): void;
}

export interface PreviewPlayback {
  play(fromSeconds: number): void;
  pause(): number;
  stop(): void;
}

export interface PlaybackCallbacks {
  onCommand(command: ActuatorCommand): void;
  onTimeUpdate(seconds: number): void;
  onComplete(): void;
}

export interface StudioPorts {
  repository: SongRepository;
  preferences: PreferenceStore;
  audio: PreviewAudio;
  createPlayback(schedule: ActuatorSchedule, callbacks: PlaybackCallbacks): PreviewPlayback;
}

export type StudioPreferences = {
  version: 1;
  favoriteIds: string[];
  recentIds: string[];
  lastSongId: string | null;
  muted: boolean;
  tempo: "normal" | "slower";
  mode: "melody" | "harmony";
  theme: "light" | "dark";
  interfaceScale: number;
  queueWidth: number;
};

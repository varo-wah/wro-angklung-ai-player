import { getVisibleCatalogSongs } from "../../../lib/songCatalog";
import { buildScheduleFromBuiltInSong } from "../../../lib/scheduleBuilder";
import { validateMotorSafety, type SafetyReport } from "../../../lib/safetyValidator";
import { validateSchedulePayload } from "../../../lib/scheduleValidator";
import type { LoadedSong, SongCatalogEntry } from "../../../lib/songTypes";
import type { ActuatorSchedule } from "../../../lib/types";
import { defaultPreferences, parsePreferences } from "./preferences";
import type { PreviewPlayback, StudioPorts, StudioPreferences } from "./ports";

export type QueueEntry = { key: number; songId: string };
export type RepeatMode = "off" | "all" | "one";

export type StudioSnapshot = {
  catalog: SongCatalogEntry[];
  catalogStatus: "idle" | "loading" | "ready" | "error";
  selectedSongId: string | null;
  song: LoadedSong | null;
  songStatus: "idle" | "loading" | "ready" | "error";
  schedule: ActuatorSchedule | null;
  safety: SafetyReport | null;
  validationErrors: string[];
  playback: "idle" | "starting" | "playing" | "paused" | "ended";
  positionSeconds: number;
  durationSeconds: number;
  activeNotes: string[];
  preferences: StudioPreferences;
  error: string | null;
  storageWarning: string | null;
  queue: QueueEntry[];
  queueIndex: number;
  shuffle: boolean;
  repeat: RepeatMode;
};

/** Application state and playback policy, independent of React and browser APIs. */
export class StudioController {
  private snapshot: StudioSnapshot = {
    catalog: [], catalogStatus: "idle", selectedSongId: null, song: null, songStatus: "idle",
    schedule: null, safety: null, validationErrors: [], playback: "idle", positionSeconds: 0,
    durationSeconds: 0, activeNotes: [], preferences: defaultPreferences(), error: null, storageWarning: null,
    queue: [], queueIndex: -1, shuffle: false, repeat: "off",
  };
  private listeners = new Set<() => void>();
  private disposed = false;
  private initialized = false;
  private catalogRequest = 0;
  private songRequest = 0;
  private playbackRequest = 0;
  private engine: PreviewPlayback | null = null;
  private queueKey = 0;
  private transitionRequest = 0;

  constructor(private readonly ports: StudioPorts) {}

  getSnapshot = (): StudioSnapshot => this.snapshot;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  initialize = async (): Promise<void> => {
    if (this.initialized || this.disposed) return;
    this.initialized = true;
    let preferences = defaultPreferences();
    try {
      preferences = parsePreferences(this.ports.preferences.load());
    } catch {
      this.publish({ storageWarning: "Saved preferences could not be read. This session will still work." });
    }
    this.ports.audio.setMuted(preferences.muted);
    this.publish({ preferences });
    await this.reloadCatalog();
  };

  reloadCatalog = async (): Promise<void> => {
    if (this.disposed) return;
    const request = ++this.catalogRequest;
    this.publish({ catalogStatus: "loading", error: null });
    try {
      const entries = await this.ports.repository.loadCatalog();
      if (this.disposed || request !== this.catalogRequest) return;
      const seen = new Set<string>();
      const catalog = getVisibleCatalogSongs(entries).filter((entry) => {
        if (entry.category === "hardware_trial" || seen.has(entry.id)) return false;
        seen.add(entry.id);
        return true;
      });
      const previous = this.snapshot.preferences;
      const preferences: StudioPreferences = {
        ...previous,
        favoriteIds: previous.favoriteIds.filter((id) => seen.has(id)),
        recentIds: previous.recentIds.filter((id) => seen.has(id)).slice(0, 6),
        lastSongId: previous.lastSongId && seen.has(previous.lastSongId) ? previous.lastSongId : null,
      };
      const currentKey = this.snapshot.queue[this.snapshot.queueIndex]?.key;
      const queue = this.snapshot.queue.filter((item) => seen.has(item.songId));
      this.publish({ catalog, catalogStatus: "ready", preferences, queue,
        queueIndex: queue.findIndex((item) => item.key === currentKey) });
      this.persist();
      if (this.snapshot.selectedSongId && seen.has(this.snapshot.selectedSongId)) return;
      this.clearSong();
      const nextId = preferences.lastSongId ?? catalog[0]?.id;
      if (nextId) await this.selectSong(nextId);
    } catch (error) {
      if (!this.disposed && request === this.catalogRequest) {
        this.publish({ catalogStatus: "error", error: errorMessage(error, "The song library could not be loaded. Try again.") });
      }
    }
  };

  selectSong = async (id: string): Promise<void> => {
    ++this.transitionRequest;
    await this.prepareSong(id);
  };

  private prepareSong = async (id: string, queueIndex?: number): Promise<void> => {
    if (this.disposed) return;
    const entry = this.snapshot.catalog.find((candidate) => candidate.id === id);
    if (!entry) return;
    if (queueIndex !== undefined) this.publish({ queueIndex });
    else if (this.snapshot.selectedSongId !== id || this.snapshot.queueIndex < 0) {
      const queue = [...this.snapshot.queue];
      const index = Math.max(0, this.snapshot.queueIndex);
      queue[index] = { key: ++this.queueKey, songId: id };
      this.publish({ queue, queueIndex: index });
    }
    if (this.snapshot.selectedSongId === id && this.snapshot.songStatus === "ready") return;
    const request = ++this.songRequest;
    this.haltPlayback();
    this.publish({ selectedSongId: id, song: null, songStatus: "loading", schedule: null, safety: null,
      validationErrors: [], positionSeconds: 0, durationSeconds: 0, playback: "idle", activeNotes: [], error: null });
    try {
      const song = await this.ports.repository.loadSong(entry);
      if (this.disposed || request !== this.songRequest) return;
      if (song.active === false || song.playable === false || song.category === "hardware_trial") {
        throw new Error("This arrangement is not available for Studio preview.");
      }
      this.publish({ song, songStatus: "ready", preferences: { ...this.snapshot.preferences, lastSongId: id } });
      this.rebuildSchedule();
      this.persist();
    } catch (error) {
      if (!this.disposed && request === this.songRequest) {
        this.publish({ songStatus: "error", error: errorMessage(error, "This arrangement could not be loaded. Try another song.") });
      }
    }
  };

  play = async (): Promise<void> => {
    const schedule = this.snapshot.schedule;
    if (this.disposed || !schedule || this.snapshot.validationErrors.length > 0
      || this.snapshot.playback === "playing" || this.snapshot.playback === "starting") return;
    const fromSeconds = this.snapshot.positionSeconds >= this.snapshot.durationSeconds ? 0 : this.snapshot.positionSeconds;
    this.haltPlayback();
    const request = this.playbackRequest;
    this.publish({ playback: "starting", positionSeconds: fromSeconds, activeNotes: [], error: null });
    try {
      // Keep this directly in the user gesture's synchronous call stack.
      await this.ports.audio.ensureReady();
      if (this.disposed || request !== this.playbackRequest) {
        if (this.disposed || this.getSnapshot().playback !== "playing") this.ports.audio.stopAll();
        return;
      }
      const current = () => !this.disposed && request === this.playbackRequest;
      this.engine = this.ports.createPlayback(schedule, {
        onCommand: (command) => {
          if (!current()) return;
          try {
            this.ports.audio.playNote(command.note, command.duration_seconds, command.strength);
          } catch (error) {
            this.failPlayback(error);
          }
        },
        onTimeUpdate: (seconds) => { if (current()) this.updatePosition(seconds); },
        onComplete: () => {
          if (!current()) return;
          this.haltPlayback();
          this.publish({ playback: "ended", positionSeconds: this.snapshot.durationSeconds, activeNotes: [] });
          if (this.snapshot.repeat === "one") void this.transitionTo(this.snapshot.queueIndex, true);
          else void this.advance(true);
        },
      });
      this.publish({ playback: "playing" });
      this.engine.play(fromSeconds);
      if (!current()) return;
      const id = this.snapshot.selectedSongId;
      if (id) {
        this.publish({ preferences: { ...this.snapshot.preferences,
          recentIds: [id, ...this.snapshot.preferences.recentIds.filter((value) => value !== id)].slice(0, 6) } });
        this.persist();
      }
    } catch (error) {
      if (!this.disposed && request === this.playbackRequest) this.failPlayback(error);
    }
  };

  pause = (): void => {
    ++this.transitionRequest;
    if (this.disposed || !["playing", "starting"].includes(this.snapshot.playback)) return;
    const seconds = this.engine?.pause() ?? this.snapshot.positionSeconds;
    this.haltPlayback();
    this.publish({ playback: "paused", positionSeconds: this.clampPosition(seconds), activeNotes: [] });
  };

  stop = (): void => {
    if (this.disposed) return;
    ++this.transitionRequest;
    this.haltPlayback();
    this.publish({ playback: "idle", positionSeconds: 0, activeNotes: [] });
  };

  /** Seeking pauses first; resuming always requires an explicit play action. */
  seek = (seconds: number): void => {
    if (this.disposed || !Number.isFinite(seconds)) return;
    ++this.transitionRequest;
    if (!this.snapshot.schedule) return;
    this.haltPlayback();
    const positionSeconds = this.clampPosition(seconds);
    this.publish({ playback: positionSeconds >= this.snapshot.durationSeconds ? "ended" : "paused", positionSeconds, activeNotes: [] });
  };

  setMuted = (muted: boolean): void => {
    if (this.disposed || muted === this.snapshot.preferences.muted) return;
    const active = this.snapshot.playback === "playing" || this.snapshot.playback === "starting";
    this.ports.audio.setMuted(muted);
    this.publish({ preferences: { ...this.snapshot.preferences, muted } });
    this.persist();
    if (!muted && active) {
      // Muted playback may never have unlocked audio. Use this user gesture to
      // unlock it before scheduling more notes, preserving the current position.
      this.pause();
      void this.play();
    }
  };

  setTempo = (tempo: StudioPreferences["tempo"]): void => {
    if (tempo !== "normal" && tempo !== "slower") return;
    this.changeArrangement({ tempo });
  };

  setMode = (mode: StudioPreferences["mode"]): void => {
    if (mode !== "melody" && mode !== "harmony") return;
    this.changeArrangement({ mode });
  };

  toggleFavorite = (id: string): void => {
    if (this.disposed || !this.snapshot.catalog.some((entry) => entry.id === id)) return;
    const ids = this.snapshot.preferences.favoriteIds;
    this.publish({ preferences: { ...this.snapshot.preferences,
      favoriteIds: ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id] } });
    this.persist();
  };

  clearError = (): void => { if (!this.disposed) this.publish({ error: null }); };

  addToQueue = (songId: string): void => {
    if (this.disposed || this.snapshot.queue.length >= 200 || !this.snapshot.catalog.some((song) => song.id === songId)) return;
    const queue = [...this.snapshot.queue];
    const index = this.snapshot.shuffle
      ? this.snapshot.queueIndex + 1 + Math.floor(Math.random() * (queue.length - this.snapshot.queueIndex))
      : queue.length;
    queue.splice(index, 0, { key: ++this.queueKey, songId });
    this.publish({ queue });
  };

  removeFromQueue = (key: number): void => {
    const index = this.snapshot.queue.findIndex((entry) => entry.key === key);
    if (this.disposed || index <= this.snapshot.queueIndex) return;
    this.publish({ queue: this.snapshot.queue.filter((entry) => entry.key !== key) });
  };

  moveInQueue = (key: number, direction: -1 | 1): void => {
    const queue = [...this.snapshot.queue];
    const index = queue.findIndex((entry) => entry.key === key);
    const target = index + direction;
    if (this.disposed || index <= this.snapshot.queueIndex || target <= this.snapshot.queueIndex || target >= queue.length) return;
    [queue[index], queue[target]] = [queue[target], queue[index]];
    this.publish({ queue, shuffle: false });
  };

  clearQueue = (): void => {
    if (!this.disposed) this.publish({ queue: this.snapshot.queue.slice(0, this.snapshot.queueIndex + 1) });
  };

  setShuffle = (shuffle: boolean): void => {
    if (this.disposed || shuffle === this.snapshot.shuffle) return;
    const past = this.snapshot.queue.slice(0, this.snapshot.queueIndex + 1);
    const upcoming = this.snapshot.queue.slice(this.snapshot.queueIndex + 1);
    this.publish({ shuffle, queue: [...past, ...(shuffle ? shuffled(upcoming) : upcoming.sort((a, b) => a.key - b.key))] });
  };

  setRepeat = (repeat: RepeatMode): void => {
    if (!this.disposed && ["off", "all", "one"].includes(repeat)) this.publish({ repeat });
  };

  playSong = async (songId: string): Promise<void> => {
    if (this.disposed || !this.snapshot.catalog.some((song) => song.id === songId)) return;
    const request = ++this.transitionRequest;
    // Unlock audio in this click, before fetching the next arrangement.
    const ready = this.unlockForTransition();
    this.haltPlayback();
    this.publish({ playback: "idle", positionSeconds: 0 });
    await this.prepareSong(songId);
    const unlocked = await ready;
    if (!this.disposed && request === this.transitionRequest) {
      if (unlocked.ok) await this.play();
      else this.failPlayback(unlocked.error);
    }
  };

  playQueueEntry = async (key: number): Promise<void> => {
    const index = this.snapshot.queue.findIndex((entry) => entry.key === key);
    if (index >= 0) await this.transitionTo(index, true);
  };

  next = async (): Promise<void> => {
    await this.advance(["playing", "starting"].includes(this.snapshot.playback));
  };

  previous = async (): Promise<void> => {
    const index = this.snapshot.positionSeconds > 3 ? this.snapshot.queueIndex : Math.max(0, this.snapshot.queueIndex - 1);
    await this.transitionTo(index, ["playing", "starting"].includes(this.snapshot.playback));
  };

  private async advance(autoplay: boolean): Promise<void> {
    if (this.disposed || !this.snapshot.queue.length) return;
    let nextIndex = this.snapshot.queueIndex + 1;
    if (nextIndex >= this.snapshot.queue.length) {
      if (this.snapshot.repeat !== "all") return;
      if (this.snapshot.shuffle && this.snapshot.queue.length > 1) {
        const lastKey = this.snapshot.queue[this.snapshot.queueIndex]?.key;
        const queue = shuffled(this.snapshot.queue);
        if (queue[0].key === lastKey) [queue[0], queue[1]] = [queue[1], queue[0]];
        this.publish({ queue });
      }
      nextIndex = 0;
    }
    await this.transitionTo(nextIndex, autoplay);
  }

  private async transitionTo(index: number, autoplay: boolean): Promise<void> {
    const entry = this.snapshot.queue[index];
    if (this.disposed || !entry) return;
    const request = ++this.transitionRequest;
    const ready = autoplay ? this.unlockForTransition() : Promise.resolve({ ok: true } as const);
    this.haltPlayback();
    this.publish({ playback: "idle", positionSeconds: 0 });
    await this.prepareSong(entry.songId, index);
    const unlocked = await ready;
    if (!this.disposed && request === this.transitionRequest && autoplay) {
      if (unlocked.ok) await this.play();
      else this.failPlayback(unlocked.error);
    }
  }

  private async unlockForTransition(): Promise<{ ok: true } | { ok: false; error: unknown }> {
    try { await this.ports.audio.ensureReady(); return { ok: true }; }
    catch (error) { return { ok: false, error }; }
  }

  readonly actions = {
    initialize: this.initialize, reloadCatalog: this.reloadCatalog, selectSong: this.selectSong,
    play: this.play, pause: this.pause, stop: this.stop, seek: this.seek, setMuted: this.setMuted,
    setTempo: this.setTempo, setMode: this.setMode, toggleFavorite: this.toggleFavorite, clearError: this.clearError,
    addToQueue: this.addToQueue, removeFromQueue: this.removeFromQueue, moveInQueue: this.moveInQueue,
    clearQueue: this.clearQueue, setShuffle: this.setShuffle, setRepeat: this.setRepeat,
    playSong: this.playSong, playQueueEntry: this.playQueueEntry, next: this.next, previous: this.previous,
  };

  dispose = (): void => {
    if (this.disposed) return;
    this.disposed = true;
    ++this.transitionRequest;
    ++this.catalogRequest;
    ++this.songRequest;
    this.haltPlayback();
    this.listeners.clear();
  };

  private changeArrangement(change: Partial<Pick<StudioPreferences, "tempo" | "mode">>): void {
    if (this.disposed || Object.entries(change).every(([key, value]) => this.snapshot.preferences[key as "tempo" | "mode"] === value)) return;
    ++this.transitionRequest;
    this.haltPlayback();
    this.publish({ preferences: { ...this.snapshot.preferences, ...change }, playback: "idle", positionSeconds: 0, activeNotes: [], error: null });
    this.rebuildSchedule();
    this.persist();
  }

  private rebuildSchedule(): void {
    const song = this.snapshot.song;
    if (!song) return;
    try {
      const schedule = buildScheduleFromBuiltInSong(song, { strength: 0.6, tempo: this.snapshot.preferences.tempo, mode: this.snapshot.preferences.mode });
      const validation = validateSchedulePayload(schedule);
      if (!validation.ok) {
        this.publish({ schedule: null, safety: null, durationSeconds: 0, validationErrors: validation.errors });
        return;
      }
      const safety = validateMotorSafety(schedule);
      const validationErrors = safety.checks.filter((check) => check.status === "failed").map((check) => check.detail);
      if (!schedule.commands.length || !Number.isFinite(schedule.timing.total_duration_seconds) || schedule.timing.total_duration_seconds <= 0) {
        validationErrors.push("This arrangement has no playable notes in the selected mode.");
      }
      this.publish({ schedule, safety, durationSeconds: schedule.timing.total_duration_seconds, validationErrors });
    } catch (error) {
      this.publish({ schedule: null, safety: null, durationSeconds: 0,
        validationErrors: [errorMessage(error, "The arrangement could not be prepared for preview.")] });
    }
  }

  private clearSong(): void {
    ++this.transitionRequest;
    ++this.songRequest;
    this.haltPlayback();
    this.publish({ selectedSongId: null, song: null, songStatus: "idle", schedule: null, safety: null,
      validationErrors: [], playback: "idle", positionSeconds: 0, durationSeconds: 0, activeNotes: [], queue: [], queueIndex: -1 });
  }

  private haltPlayback(): void {
    ++this.playbackRequest;
    const engine = this.engine;
    this.engine = null;
    engine?.stop();
    this.ports.audio.stopAll();
  }

  private failPlayback(error: unknown): void {
    this.haltPlayback();
    this.publish({ playback: "paused", activeNotes: [], error: errorMessage(error, "Audio preview could not start. Try Play again.") });
  }

  private updatePosition(seconds: number): void {
    const positionSeconds = this.clampPosition(seconds);
    const activeNotes = [...new Set(this.snapshot.schedule?.commands
      .filter((command) => command.start_time_seconds <= positionSeconds && command.start_time_seconds + command.duration_seconds > positionSeconds)
      .map((command) => command.note) ?? [])];
    this.publish({ positionSeconds, activeNotes });
  }

  private clampPosition(seconds: number): number {
    return Number.isFinite(seconds) ? Math.max(0, Math.min(seconds, this.snapshot.durationSeconds)) : this.snapshot.positionSeconds;
  }

  private persist(): void {
    try { this.ports.preferences.save(this.snapshot.preferences); }
    catch { this.publish({ storageWarning: "Preferences are kept for this session; browser storage is unavailable." }); }
  }

  private publish(update: Partial<StudioSnapshot>): void {
    if (this.disposed) return;
    this.snapshot = { ...this.snapshot, ...update };
    this.listeners.forEach((listener) => listener());
  }
}

function shuffled<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

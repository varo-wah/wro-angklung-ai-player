import type { BuiltInSongNote } from "./builtInSongs";
import type { SafetyReport } from "./safetyValidator";
import type { ActuatorSchedule, PlaybackState } from "./types";

export const SYSTEM_SYNC_CHANNEL = "wro-angklung-system";
export const SYSTEM_SYNC_STORAGE_KEY = "wro-angklung-system-snapshot";

export type SyncedChatMessage = {
  id: number;
  speaker: "assistant" | "user";
  text: string;
};

export type SyncedSourceMode = "library" | "youtube_placeholder" | "manual_upload";
export type SyncedSystemStatus = "idle" | "request_received" | "schedule_generated" | "validated" | "playing" | "stopped" | "unsupported";

export type SyncedWorkflowStatus = {
  requestReceived: boolean;
  libraryChecked: boolean;
  songFound: boolean | null;
  scheduleGenerated: boolean;
  validationPassed: boolean;
  readyForSimulation: boolean;
};

export type SyncedSystemSnapshot = {
  activeCommandIds: string[];
  activeInstrumentIds: string[];
  chatMessages: SyncedChatMessage[];
  elapsedSeconds: number;
  generatedNotes: BuiltInSongNote[];
  latestUserRequest: string;
  playbackState: PlaybackState;
  safetyReport: SafetyReport | null;
  schedule: ActuatorSchedule | null;
  selectedSongId: string;
  sourceLabel: string;
  sourceMode: SyncedSourceMode;
  sourceTabId: string;
  systemStatus: SyncedSystemStatus;
  updatedAt: number;
  workflowStatus: SyncedWorkflowStatus;
  youtubeFallbackActive: boolean;
};

type SystemSyncController = {
  broadcastAvailable: boolean;
  close: () => void;
  publish: (snapshot: SyncedSystemSnapshot) => void;
  storageAvailable: boolean;
};

export function createSyncTabId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `tab-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function createSystemSyncController(
  tabId: string,
  onSnapshot: (snapshot: SyncedSystemSnapshot) => void,
): SystemSyncController {
  const channel = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel(SYSTEM_SYNC_CHANNEL);
  const storageAvailable = canUseLocalStorage();

  function handleSnapshot(candidate: unknown) {
    const snapshot = normalizeSnapshot(candidate);
    if (!snapshot || snapshot.sourceTabId === tabId) {
      return;
    }
    onSnapshot(snapshot);
  }

  channel?.addEventListener("message", (event: MessageEvent<unknown>) => handleSnapshot(event.data));

  function handleStorage(event: StorageEvent) {
    if (event.key !== SYSTEM_SYNC_STORAGE_KEY || !event.newValue) {
      return;
    }

    try {
      handleSnapshot(JSON.parse(event.newValue) as unknown);
    } catch {
      // Ignore malformed sync payloads from older or interrupted sessions.
    }
  }

  window.addEventListener("storage", handleStorage);

  return {
    broadcastAvailable: Boolean(channel),
    close: () => {
      channel?.close();
      window.removeEventListener("storage", handleStorage);
    },
    publish: (snapshot) => {
      try {
        localStorage.setItem(SYSTEM_SYNC_STORAGE_KEY, JSON.stringify(snapshot));
      } catch {
        // Storage may be blocked in private windows; BroadcastChannel can still work.
      }
      channel?.postMessage(snapshot);
    },
    storageAvailable,
  };
}

export function readStoredSystemSnapshot(): SyncedSystemSnapshot | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return normalizeSnapshot(JSON.parse(localStorage.getItem(SYSTEM_SYNC_STORAGE_KEY) ?? "null"));
  } catch {
    return null;
  }
}

function normalizeSnapshot(candidate: unknown): SyncedSystemSnapshot | null {
  if (!candidate || typeof candidate !== "object") {
    return null;
  }

  const snapshot = candidate as Partial<SyncedSystemSnapshot>;
  if (typeof snapshot.updatedAt !== "number" || typeof snapshot.sourceTabId !== "string") {
    return null;
  }
  if (typeof snapshot.selectedSongId !== "string" || typeof snapshot.sourceLabel !== "string") {
    return null;
  }

  return {
    activeCommandIds: Array.isArray(snapshot.activeCommandIds) ? snapshot.activeCommandIds.filter(isString) : [],
    activeInstrumentIds: Array.isArray(snapshot.activeInstrumentIds) ? snapshot.activeInstrumentIds.filter(isString) : [],
    chatMessages: Array.isArray(snapshot.chatMessages) ? snapshot.chatMessages.filter(isChatMessage) : [],
    elapsedSeconds: typeof snapshot.elapsedSeconds === "number" ? snapshot.elapsedSeconds : 0,
    generatedNotes: Array.isArray(snapshot.generatedNotes) ? snapshot.generatedNotes : [],
    latestUserRequest: typeof snapshot.latestUserRequest === "string" ? snapshot.latestUserRequest : "",
    playbackState: isPlaybackState(snapshot.playbackState) ? snapshot.playbackState : "idle",
    safetyReport: snapshot.safetyReport ?? null,
    schedule: snapshot.schedule ?? null,
    selectedSongId: snapshot.selectedSongId,
    sourceLabel: snapshot.sourceLabel,
    sourceMode: isSourceMode(snapshot.sourceMode) ? snapshot.sourceMode : "library",
    sourceTabId: snapshot.sourceTabId,
    systemStatus: isSystemStatus(snapshot.systemStatus) ? snapshot.systemStatus : "idle",
    updatedAt: snapshot.updatedAt,
    workflowStatus: isWorkflowStatus(snapshot.workflowStatus)
      ? snapshot.workflowStatus
      : {
          requestReceived: false,
          libraryChecked: false,
          songFound: null,
          scheduleGenerated: false,
          validationPassed: false,
          readyForSimulation: false,
        },
    youtubeFallbackActive: Boolean(snapshot.youtubeFallbackActive),
  };
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isChatMessage(value: unknown): value is SyncedChatMessage {
  if (!value || typeof value !== "object") {
    return false;
  }
  const message = value as Partial<SyncedChatMessage>;
  return typeof message.id === "number" && (message.speaker === "assistant" || message.speaker === "user") && typeof message.text === "string";
}

function isPlaybackState(value: unknown): value is PlaybackState {
  return value === "idle" || value === "playing" || value === "paused" || value === "stopped";
}

function isSourceMode(value: unknown): value is SyncedSourceMode {
  return value === "library" || value === "youtube_placeholder" || value === "manual_upload";
}

function isSystemStatus(value: unknown): value is SyncedSystemStatus {
  return value === "idle" || value === "request_received" || value === "schedule_generated" || value === "validated" || value === "playing" || value === "stopped" || value === "unsupported";
}

function isWorkflowStatus(value: unknown): value is SyncedWorkflowStatus {
  if (!value || typeof value !== "object") {
    return false;
  }
  const status = value as Partial<SyncedWorkflowStatus>;
  return (
    typeof status.requestReceived === "boolean" &&
    typeof status.libraryChecked === "boolean" &&
    (typeof status.songFound === "boolean" || status.songFound === null) &&
    typeof status.scheduleGenerated === "boolean" &&
    typeof status.validationPassed === "boolean" &&
    typeof status.readyForSimulation === "boolean"
  );
}

function canUseLocalStorage(): boolean {
  try {
    const testKey = `${SYSTEM_SYNC_STORAGE_KEY}-test`;
    localStorage.setItem(testKey, "1");
    localStorage.removeItem(testKey);
    return true;
  } catch {
    return false;
  }
}

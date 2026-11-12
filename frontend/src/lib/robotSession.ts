import type { ArduinoConnectionState } from "./arduinoSerial";
import type { SyncedSystemSnapshot } from "./systemSync";

export type StudioAction =
  | { type: "playSong" | "addToQueue"; songId: string }
  | { type: "removeFromQueue" | "playQueueEntry"; key: number }
  | { type: "moveInQueue"; key: number; direction: -1 | 1 }
  | { type: "setRepeat"; repeat: "off" | "all" | "one" }
  | { type: "setShuffle"; shuffle: boolean }
  | { type: "previous" | "next" | "clearQueue" };

export type RobotAction =
  | StudioAction
  | { type: "seek"; seconds: number }
  | { type: "settings"; settings: { strength: number; tempo: "normal" | "slower"; mode: "melody" | "harmony" } }
  | { type: "request"; text: string; language: "en" | "id" }
  | { type: "select"; songId: string }
  | { type: "start_pending"; requestId: string }
  | { type: "play" | "pause" | "stop" | "estop" | "reset" | "generate" | "wake" | "cancel" | "clear" };
export type RobotCommand = { id: string; action: RobotAction; createdAt: number };
export type RobotResult = { ok: boolean; pending?: boolean; value?: string | boolean | null; error?: string };
export type RobotStatus = {
  virtualPlayback?: boolean;
  hostOnline: boolean;
  arduino: ArduinoConnectionState;
  sourceLabel: string;
  playbackState: string;
  lastSeen: number | null;
};
export type RobotView = RobotStatus & {
  revision: number;
  snapshot?: SyncedSystemSnapshot | null;
};
export const OFFLINE_ROBOT: RobotStatus = {
  hostOnline: false,
  arduino: { status: "disconnected", outputMode: "unknown", message: "Mac controller offline." },
  sourceLabel: "", playbackState: "stopped", lastSeen: null,
};
export const HOST_LEASE_MS = 5000;
export const COMMAND_QUEUE_MS = 8000;
export const COMMAND_RUN_MS = 65000;
export const isInterrupt = (action: RobotAction) => ["stop", "estop", "pause", "reset", "cancel", "seek"].includes(action.type);

export function parseRobotAction(value: unknown): RobotAction {
  if (!value || typeof value !== "object") throw new Error("Invalid command.");
  const a = value as Record<string, unknown>;
  if ((a.type === "playSong" || a.type === "addToQueue") && typeof a.songId === "string" && /^[a-zA-Z0-9_-]{1,120}$/.test(a.songId)) return { type: a.type, songId: a.songId };
  if (typeof a.key === "number" && Number.isSafeInteger(a.key) && a.key > 0) {
    if (a.type === "playQueueEntry" || a.type === "removeFromQueue") return { type: a.type, key: a.key };
    if (a.type === "moveInQueue" && (a.direction === 1 || a.direction === -1)) return { type: a.type, key: a.key, direction: a.direction };
  }
  if (a.type === "setRepeat" && (a.repeat === "off" || a.repeat === "one" || a.repeat === "all")) return { type: a.type, repeat: a.repeat };
  if (a.type === "setShuffle" && typeof a.shuffle === "boolean") return { type: a.type, shuffle: a.shuffle };
  if (a.type === "next" || a.type === "previous" || a.type === "clearQueue") return { type: a.type };
  if (a.type === "seek" && typeof a.seconds === "number" && Number.isFinite(a.seconds) && a.seconds >= 0) return { type: "seek", seconds: a.seconds };
  if (a.type === "request" && typeof a.text === "string" && a.text.trim().length > 0 && a.text.length <= 2000 && (a.language === "en" || a.language === "id")) {
    return { type: "request", text: a.text.trim(), language: a.language };
  }
  if (a.type === "settings" && a.settings && typeof a.settings === "object") {
    const s = a.settings as Record<string, unknown>;
    if (typeof s.strength === "number" && Number.isFinite(s.strength) && s.strength >= 0 && s.strength <= 1 &&
        (s.tempo === "normal" || s.tempo === "slower") && (s.mode === "melody" || s.mode === "harmony")) {
      return { type: "settings", settings: { strength: s.strength, tempo: s.tempo, mode: s.mode } };
    }
    throw new Error("Invalid arrangement settings.");
  }
  if (a.type === "select" && typeof a.songId === "string" && /^[a-zA-Z0-9_-]{1,120}$/.test(a.songId)) return { type: "select", songId: a.songId };
  if (a.type === "start_pending" && typeof a.requestId === "string" && /^[a-zA-Z0-9-]{1,80}$/.test(a.requestId)) return { type: "start_pending", requestId: a.requestId };
  if (["play", "pause", "stop", "estop", "reset", "generate", "wake", "cancel", "clear"].includes(String(a.type))) return { type: a.type } as RobotAction;
  throw new Error("Unsupported robot command.");
}

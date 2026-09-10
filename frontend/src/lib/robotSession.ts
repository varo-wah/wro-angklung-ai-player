import type { ArduinoConnectionState } from "./arduinoSerial";
import type { SyncedSystemSnapshot } from "./systemSync";

export type RobotAction =
  | { type: "request"; text: string; language: "en" | "id" }
  | { type: "select"; songId: string }
  | { type: "start_pending"; requestId: string }
  | { type: "play" | "pause" | "stop" | "estop" | "reset" | "generate" | "wake" | "cancel" | "clear" };
export type RobotCommand = { id: string; action: RobotAction; createdAt: number };
export type RobotResult = { ok: boolean; pending?: boolean; value?: string | boolean | null; error?: string };
export type RobotStatus = {
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
export const isInterrupt = (action: RobotAction) => ["stop", "estop", "pause", "reset", "cancel"].includes(action.type);

export function parseRobotAction(value: unknown): RobotAction {
  if (!value || typeof value !== "object") throw new Error("Invalid command.");
  const a = value as Record<string, unknown>;
  if (a.type === "request" && typeof a.text === "string" && a.text.trim().length > 0 && a.text.length <= 2000 && (a.language === "en" || a.language === "id")) {
    return { type: "request", text: a.text.trim(), language: a.language };
  }
  if (a.type === "select" && typeof a.songId === "string" && /^[a-zA-Z0-9_-]{1,120}$/.test(a.songId)) return { type: "select", songId: a.songId };
  if (a.type === "start_pending" && typeof a.requestId === "string" && /^[a-zA-Z0-9-]{1,80}$/.test(a.requestId)) return { type: "start_pending", requestId: a.requestId };
  if (["play", "pause", "stop", "estop", "reset", "generate", "wake", "cancel", "clear"].includes(String(a.type))) return { type: a.type } as RobotAction;
  throw new Error("Unsupported robot command.");
}

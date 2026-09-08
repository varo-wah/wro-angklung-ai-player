import { normalizeForMatching, normalizeVisitorInput } from "./ai/inputNormalization";

export type PlaybackChatCommand = "play" | "stop" | "pause" | "resume";

const PLAY_COMMANDS = new Set(["play", "play it", "start", "start it", "mainkan", "putar", "mulai"]);
const STOP_COMMANDS = new Set([
  "stop",
  "stop music",
  "stop the music",
  "stop playing",
  "stop song",
  "shut up",
  "cancel playback",
  "end song",
  "emergency stop",
  "halt",
  "berhenti",
  "hentikan",
  "batal",
]);

const PAUSE_COMMANDS = new Set(["pause", "pause music", "pause the music", "pause song", "jeda", "jeda musik"]);
const RESUME_COMMANDS = new Set(["resume", "continue", "keep playing", "lanjut", "lanjutkan"]);

export function routePlaybackChatCommand(message: string): PlaybackChatCommand | null {
  const normalized = normalizeForMatching(normalizeVisitorInput(message));
  if (PLAY_COMMANDS.has(normalized)) return "play";
  if (STOP_COMMANDS.has(normalized)) return "stop";
  if (PAUSE_COMMANDS.has(normalized)) return "pause";
  if (RESUME_COMMANDS.has(normalized)) return "resume";
  return null;
}

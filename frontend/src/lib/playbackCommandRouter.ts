export type PlaybackChatCommand = "stop" | "pause" | "resume";

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
]);

const PAUSE_COMMANDS = new Set(["pause", "pause music", "pause the music", "pause song"]);
const RESUME_COMMANDS = new Set(["resume", "continue", "keep playing"]);

export function routePlaybackChatCommand(message: string): PlaybackChatCommand | null {
  const normalized = message.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
  if (STOP_COMMANDS.has(normalized)) return "stop";
  if (PAUSE_COMMANDS.has(normalized)) return "pause";
  if (RESUME_COMMANDS.has(normalized)) return "resume";
  return null;
}

import type { StudioPreferences } from "./ports";

export const PREFERENCE_KEY = "angklobot.studio.preferences.v1";

export function defaultPreferences(): StudioPreferences {
  return { version: 1, favoriteIds: [], recentIds: [], lastSongId: null, muted: false, tempo: "normal", mode: "melody" };
}

/** Never trust persisted JSON, including data left by a future app version. */
export function parsePreferences(value: unknown): StudioPreferences {
  if (!value || typeof value !== "object" || Array.isArray(value)) return defaultPreferences();
  const record = value as Record<string, unknown>;
  if (record.version !== 1) return defaultPreferences();
  return {
    version: 1,
    favoriteIds: ids(record.favoriteIds),
    recentIds: ids(record.recentIds).slice(0, 6),
    lastSongId: typeof record.lastSongId === "string" && record.lastSongId.length > 0 ? record.lastSongId : null,
    muted: record.muted === true,
    tempo: record.tempo === "slower" ? "slower" : "normal",
    mode: record.mode === "harmony" ? "harmony" : "melody",
  };
}

function ids(value: unknown): string[] {
  return Array.isArray(value)
    ? [...new Set(value.filter((id): id is string => typeof id === "string" && id.length > 0))]
    : [];
}

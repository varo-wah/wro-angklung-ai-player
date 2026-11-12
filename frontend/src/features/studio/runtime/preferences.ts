import type { StudioPreferences } from "./ports";

export const PREFERENCE_KEY = "angklobot.studio.preferences.v1";
export const INTERFACE_SIZE = { min: 100, max: 140, step: 10, default: 120 } as const;
export const QUEUE_WIDTH = { min: 250, max: 460, default: 320 } as const;

// Runs inside the Studio root during HTML parsing, before its content paints.
// Only validated presentation values are applied; no song or playback is restored here.
export const APPEARANCE_BOOTSTRAP = `(function(){try{
  var p=JSON.parse(localStorage.getItem(${JSON.stringify(PREFERENCE_KEY)}));
  var root=document.currentScript.parentElement;
  if(!p||p.version!==1||!root)return;
  root.dataset.theme=p.theme==='dark'?'dark':'light';
  var size=typeof p.interfaceScale==='number'&&Number.isFinite(p.interfaceScale)
    ?Math.min(${INTERFACE_SIZE.max},Math.max(${INTERFACE_SIZE.min},Math.round(p.interfaceScale/${INTERFACE_SIZE.step})*${INTERFACE_SIZE.step})):${INTERFACE_SIZE.default};
  root.style.setProperty('--ui-scale',String(size/100));
}catch(e){}})();`;

export function normalizeInterfaceScale(value: unknown): number {
  return boundedNumber(value, INTERFACE_SIZE.min, INTERFACE_SIZE.max, INTERFACE_SIZE.default, INTERFACE_SIZE.step);
}

export function normalizeQueueWidth(value: unknown): number {
  return boundedNumber(value, QUEUE_WIDTH.min, QUEUE_WIDTH.max, QUEUE_WIDTH.default);
}

function boundedNumber(value: unknown, min: number, max: number, fallback: number, step = 1): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(max, Math.max(min, Math.round(value / step) * step)) : fallback;
}

export function defaultPreferences(): StudioPreferences {
  return { version: 1, favoriteIds: [], recentIds: [], lastSongId: null, muted: false, volume: 100, tempo: "normal", mode: "melody",
    theme: "light", interfaceScale: INTERFACE_SIZE.default, queueWidth: QUEUE_WIDTH.default };
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
    volume: boundedNumber(record.volume, 0, 100, 100),
    muted: record.muted === true,
    tempo: record.tempo === "slower" ? "slower" : "normal",
    mode: record.mode === "harmony" ? "harmony" : "melody",
    theme: record.theme === "dark" ? "dark" : "light",
    interfaceScale: normalizeInterfaceScale(record.interfaceScale),
    queueWidth: normalizeQueueWidth(record.queueWidth),
  };
}

function ids(value: unknown): string[] {
  return Array.isArray(value)
    ? [...new Set(value.filter((id): id is string => typeof id === "string" && id.length > 0))]
    : [];
}

import type { SongCatalogEntry } from "./songTypes";

export async function loadSongCatalog(): Promise<SongCatalogEntry[]> {
  const response = await fetch("/songs/catalog.json", { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Song catalog failed to load.");
  }

  const catalog = (await response.json()) as unknown;
  if (!Array.isArray(catalog)) {
    throw new Error("Song catalog failed to load.");
  }

  return catalog.filter(isCatalogEntry);
}

export function getActiveCatalogSongs(catalog: SongCatalogEntry[]): SongCatalogEntry[] {
  return catalog.filter((song) => song.active !== false && song.playable !== false);
}

export function getVisibleCatalogSongs(catalog: SongCatalogEntry[]): SongCatalogEntry[] {
  return getActiveCatalogSongs(catalog).filter((song) => song.visible_in_guest !== false);
}

function isCatalogEntry(value: unknown): value is SongCatalogEntry {
  if (!value || typeof value !== "object") {
    return false;
  }

  const entry = value as Partial<SongCatalogEntry>;
  return typeof entry.id === "string" && typeof entry.title === "string" && typeof entry.path === "string";
}

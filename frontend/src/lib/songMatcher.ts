import type { SongCatalogEntry } from "./songTypes";

export function findCatalogSong(request: string, catalog: SongCatalogEntry[]): SongCatalogEntry | null {
  const normalizedRequest = normalizeSongText(request);
  if (!normalizedRequest) {
    return null;
  }

  const activeSongs = catalog.filter((song) => song.active !== false && song.playable !== false);
  return (
    activeSongs.find((song) => {
      const normalizedTitle = normalizeSongText(song.title);
      const aliases = song.aliases ?? [];

      return (
        normalizedTitle.includes(normalizedRequest) ||
        normalizedRequest.includes(normalizedTitle) ||
        aliases.some((alias) => {
          const normalizedAlias = normalizeSongText(alias);
          return normalizedAlias.includes(normalizedRequest) || normalizedRequest.includes(normalizedAlias);
        })
      );
    }) ?? null
  );
}

function normalizeSongText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

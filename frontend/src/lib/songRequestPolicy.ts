import type { AiCatalogEntry } from "./ai/songRequestSchema";
import { matchSongRequest } from "./ai/songMatcher";

/** Only an explicit title/alias request can bypass conversational confirmation. */
export function directSongCandidates(message: string, catalog: AiCatalogEntry[]): AiCatalogEntry[] {
  const match = matchSongRequest(message, catalog);
  return match.confidence === "high" && match.best ? [match.best.song] : match.candidates.map((candidate) => candidate.song);
}

import type { AiCatalogEntry } from "./songRequestSchema";
import { compactForMatching, normalizeForMatching } from "./inputNormalization";

export const HIGH_SONG_MATCH_THRESHOLD = 0.88;
export const MEDIUM_SONG_MATCH_THRESHOLD = 0.68;
export const SONG_MATCH_MARGIN = 0.08;

export type SongMatchCandidate = { song: AiCatalogEntry; score: number; phrase: string };
export type SongMatchResult = {
  confidence: "high" | "medium" | "low";
  candidates: SongMatchCandidate[];
  best: SongMatchCandidate | null;
};

const REQUEST_PREFIX = /^(?:(?:please|tolong)\s+)?(?:play|start|mainkan|putar|putarkan)(?:\s+(?:the\s+)?(?:song|lagu))?\s+/;

export function matchSongRequest(message: string, catalog: AiCatalogEntry[]): SongMatchResult {
  const query = normalizeForMatching(message).replace(REQUEST_PREFIX, "").replace(/\s+(?:please|tolong)$/, "")
    .replace(/\b(?:by|oleh)\b/g, "").replace(/\s+/g, " ").trim();
  if (!query || isTransportOnly(query)) return { best: null, candidates: [], confidence: "low" };

  const candidates = catalog.filter(isActiveSong).map((song) => scoreSong(query, song)).sort((a, b) => b.score - a.score);
  const best = candidates[0] ?? null;
  const runnerUp = candidates[1]?.score ?? 0;
  const clearWinner = Boolean(best && best.score - runnerUp >= SONG_MATCH_MARGIN);
  const confidence = best && best.score >= HIGH_SONG_MATCH_THRESHOLD && clearWinner
    ? "high"
    : best && best.score >= MEDIUM_SONG_MATCH_THRESHOLD
      ? "medium"
      : "low";
  return { best, candidates: candidates.filter((candidate) => candidate.score >= MEDIUM_SONG_MATCH_THRESHOLD).slice(0, 3), confidence };
}

function scoreSong(query: string, song: AiCatalogEntry): SongMatchCandidate {
  const phrases = [song.title, ...(song.aliases ?? [])].map(normalizeForMatching);
  let best = { score: 0, phrase: phrases[0] ?? "" };
  for (const phrase of phrases) {
    const score = phraseScore(query, phrase);
    if (score > best.score) best = { score, phrase };
  }
  return { song, score: Math.round(best.score * 1000) / 1000, phrase: best.phrase };
}

function phraseScore(query: string, phrase: string): number {
  if (!phrase) return 0;
  if (query === phrase) return 1;
  const compactQuery = compactForMatching(query);
  const compactPhrase = compactForMatching(phrase);
  if (compactQuery === compactPhrase) return 0.99;
  if (containsWholePhrase(query, phrase)) return Math.min(0.98, 0.91 + phrase.length / Math.max(query.length, 1) * 0.07);
  if (compactQuery.includes(compactPhrase) && compactPhrase.length >= 5) return 0.92;

  const queryTokens = new Set(query.split(" "));
  const phraseTokens = new Set(phrase.split(" "));
  const intersection = [...phraseTokens].filter((token) => queryTokens.has(token)).length;
  const tokenCoverage = intersection / Math.max(phraseTokens.size, 1);
  const tokenPrecision = intersection / Math.max(queryTokens.size, 1);
  if (tokenCoverage === 1 && phraseTokens.size >= 2) return 0.91 + tokenPrecision * 0.05;
  const tokenScore = tokenCoverage * 0.7 + tokenPrecision * 0.3;
  const editScore = 1 - levenshtein(compactQuery, compactPhrase) / Math.max(compactQuery.length, compactPhrase.length, 1);
  return tokenScore * 0.65 + editScore * 0.35;
}

function containsWholePhrase(message: string, phrase: string): boolean {
  return message === phrase || ` ${message} `.includes(` ${phrase} `);
}

function levenshtein(left: string, right: string): number {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    let diagonal = previous[0];
    previous[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      const above = previous[j];
      previous[j] = Math.min(previous[j] + 1, previous[j - 1] + 1, diagonal + (left[i - 1] === right[j - 1] ? 0 : 1));
      diagonal = above;
    }
  }
  return previous[right.length];
}

function isActiveSong(song: AiCatalogEntry): boolean {
  return song.active !== false && song.playable !== false && song.visible_in_guest !== false;
}

function isTransportOnly(query: string): boolean {
  return /^(play|start|start it|play it|stop|pause|resume|continue|cancel|mainkan|putar|berhenti|jeda|lanjut)$/.test(query);
}

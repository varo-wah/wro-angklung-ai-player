import type { AiCatalogEntry, AiSongRequestContext, AiSongRequestResult } from "./songRequestSchema";

export function createLocalFallbackSongRequestResult(
  message: string,
  catalog: AiCatalogEntry[],
  context: AiSongRequestContext = {},
  fallbackReason?: string,
): AiSongRequestResult {
  const activeSongs = catalog.filter((song) => song.active !== false && song.playable !== false && song.visible_in_guest !== false);
  const normalizedMessage = normalizeText(message);
  const pendingSong = context.pending_song_id ? activeSongs.find((song) => song.id === context.pending_song_id) ?? null : null;

  if (pendingSong && isAffirmative(normalizedMessage)) {
    return {
      assistant_message: `Great. I will play ${pendingSong.title} now.`,
      confidence: 0.92,
      fallback_reason: fallbackReason,
      intent: "confirm_playback",
      matched_song_id: pendingSong.id,
      needs_confirmation: false,
      needs_operator_review: true,
      next_state: "ready_to_play",
      provider: "local_fallback",
      should_generate_schedule: true,
      spoken_response: `Great. I will play ${pendingSong.title} now.`,
    };
  }

  if (pendingSong && isNegative(normalizedMessage)) {
    return {
      assistant_message: "No problem. I will not play that one. You can ask for another supported song.",
      confidence: 0.86,
      fallback_reason: fallbackReason,
      intent: "reject_suggestion",
      matched_song_id: null,
      needs_confirmation: false,
      needs_operator_review: false,
      next_state: "awaiting_song",
      provider: "local_fallback",
      should_generate_schedule: false,
      spoken_response: "No problem. I will not play that one. You can ask for another supported song.",
    };
  }

  if (isGreetingOrSmalltalk(normalizedMessage)) {
    const titles = formatSongList(activeSongs);
    const assistantMessage = `Hi, I am Angklobot. You can ask me to play one of the supported angklung songs. I can play: ${titles}.`;
    return {
      assistant_message: assistantMessage,
      confidence: 0.88,
      fallback_reason: fallbackReason,
      intent: "smalltalk",
      matched_song_id: null,
      needs_confirmation: false,
      needs_operator_review: false,
      next_state: "awaiting_song",
      provider: "local_fallback",
      should_generate_schedule: false,
      spoken_response: assistantMessage,
    };
  }

  if (isCapabilityQuestion(normalizedMessage)) {
    const titles = formatSongList(activeSongs);
    return {
      assistant_message: `I can play preloaded validated angklung arrangements. Available songs are: ${titles}.`,
      confidence: 0.8,
      fallback_reason: fallbackReason,
      intent: "ask_capabilities",
      matched_song_id: null,
      needs_confirmation: false,
      needs_operator_review: false,
      next_state: "awaiting_song",
      provider: "local_fallback",
      should_generate_schedule: false,
      spoken_response: `I can play these songs: ${titles}.`,
    };
  }

  const matchedSong = findFallbackSong(normalizedMessage, activeSongs);
  if (matchedSong) {
    const highConfidence = getMatchConfidence(normalizedMessage, matchedSong) >= 0.9;
    const assistantMessage = `I can play ${matchedSong.title}. Do you want me to play it?`;

    return {
      assistant_message: assistantMessage,
      confidence: highConfidence ? 0.94 : 0.82,
      fallback_reason: fallbackReason,
      intent: "suggest_song",
      matched_song_id: matchedSong.id,
      needs_confirmation: true,
      needs_operator_review: true,
      next_state: "awaiting_confirmation",
      provider: "local_fallback",
      should_generate_schedule: false,
      spoken_response: assistantMessage,
    };
  }

  const alternatives = activeSongs.slice(0, 3).map((song) => song.title).join(", ");
  const assistantMessage = `That song is not in the validated angklung library yet. I can offer ${alternatives}.`;
  return {
    assistant_message: assistantMessage,
    confidence: 0.7,
    fallback_reason: fallbackReason,
    intent: "unsupported_song",
    matched_song_id: null,
    needs_confirmation: false,
    needs_operator_review: true,
    next_state: "unsupported",
    provider: "local_fallback",
    should_generate_schedule: false,
    spoken_response: assistantMessage,
  };
}

function findFallbackSong(normalizedMessage: string, songs: AiCatalogEntry[]): AiCatalogEntry | null {
  const keywordMatch = findKeywordMatch(normalizedMessage, songs);
  if (keywordMatch) {
    return keywordMatch;
  }

  return (
    songs.find((song) => {
      const title = normalizeText(song.title);
      const aliases = song.aliases ?? [];
      return (
        title.includes(normalizedMessage) ||
        normalizedMessage.includes(title) ||
        aliases.some((alias) => {
          const normalizedAlias = normalizeText(alias);
          return normalizedAlias.includes(normalizedMessage) || normalizedMessage.includes(normalizedAlias);
        })
      );
    }) ?? null
  );
}

function findKeywordMatch(normalizedMessage: string, songs: AiCatalogEntry[]): AiCatalogEntry | null {
  const keywordRules: Array<{ keywords: string[]; songId: string }> = [
    { keywords: ["bruno", "bruno mars"], songId: "count_on_me" },
    { keywords: ["aladdin", "whole new world"], songId: "a_whole_new_world" },
    { keywords: ["coldplay", "viva"], songId: "viva_la_vida" },
    { keywords: ["musescore", "midi perfect"], songId: "perfect_musescore_ver" },
  ];

  const rule = keywordRules.find((candidate) => candidate.keywords.some((keyword) => normalizedMessage.includes(keyword)));
  return rule ? songs.find((song) => song.id === rule.songId) ?? null : null;
}

function getMatchConfidence(normalizedMessage: string, song: AiCatalogEntry): number {
  const title = normalizeText(song.title);
  if (normalizedMessage === title || normalizedMessage.includes(`play ${title}`)) {
    return 0.95;
  }
  if ((song.aliases ?? []).some((alias) => normalizedMessage.includes(normalizeText(alias)))) {
    return 0.9;
  }
  return 0.82;
}

function isCapabilityQuestion(normalizedMessage: string): boolean {
  return (
    normalizedMessage.includes("what songs") ||
    normalizedMessage.includes("available") ||
    normalizedMessage.includes("what can") ||
    normalizedMessage.includes("capabilities")
  );
}

function isAffirmative(normalizedMessage: string): boolean {
  return ["yes", "yeah", "yep", "sure", "ok", "okay", "confirm", "play it", "go ahead", "do it", "bet", "lets go", "let s go"].some(
    (phrase) => normalizedMessage === phrase || normalizedMessage.includes(phrase),
  );
}

function isNegative(normalizedMessage: string): boolean {
  return ["no", "nah", "nope", "not that", "cancel", "nevermind", "never mind", "choose another", "another one", "stop", "don t", "do not"].some(
    (phrase) => normalizedMessage === phrase || normalizedMessage.includes(phrase),
  );
}

function isGreetingOrSmalltalk(normalizedMessage: string): boolean {
  return [
    "hello",
    "hi",
    "hey",
    "yo",
    "good morning",
    "good afternoon",
    "good evening",
    "what s up",
    "whats up",
    "who are you",
    "how are you",
  ].some((phrase) => normalizedMessage === phrase || normalizedMessage.includes(phrase));
}

function formatSongList(songs: AiCatalogEntry[]): string {
  return songs.map((song) => song.title).join(", ");
}

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

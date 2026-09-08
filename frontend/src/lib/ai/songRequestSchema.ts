import type { SongCatalogEntry } from "../songTypes";

export type AiSongRequestIntent =
  | "greeting"
  | "general_chat"
  | "question_about_machine"
  | "question_about_angklung"
  | "ask_capabilities"
  | "list_songs"
  | "song_request"
  | "artist_request"
  | "genre_request"
  | "mood_request"
  | "suggest_song"
  | "confirmation_yes"
  | "confirmation_no"
  | "unsupported_song"
  | "explain_limitation"
  | "smalltalk"
  | "unknown";

export type AiAssistantMode = "local_ollama" | "openai_optional" | "local_fallback";

export type AiConversationState = "idle" | "awaiting_song" | "awaiting_confirmation" | "ready_to_play" | "unsupported";

export type AiPreRouterDecision =
  | "greeting"
  | "smalltalk"
  | "confirmation"
  | "high_confidence_song_match"
  | "ambiguous_song_match"
  | "reference"
  | "list_songs"
  | "genre"
  | "out_of_scope"
  | "protected_internal_request"
  | "transport_command";

export type AiSongRequestResult = {
  intent: AiSongRequestIntent;
  matched_song_id: string | null;
  confidence: number;
  spoken_response: string;
  speech_text: string;
  assistant_message: string;
  should_search_catalog: boolean;
  should_generate_schedule: boolean;
  needs_confirmation: boolean;
  needs_operator_review: boolean;
  next_state: AiConversationState;
  suggested_song_ids: string[];
  last_unsupported_request: string | null;
  provider: AiAssistantMode;
  fallback_reason: string | null;
  model: string | null;
  pre_router_decision: AiPreRouterDecision | null;
  raw_provider_result: string | null;
  knowledge_sections: string[];
};

export type AiCatalogEntry = Pick<
  SongCatalogEntry,
  | "id"
  | "title"
  | "aliases"
  | "category"
  | "difficulty"
  | "playable"
  | "active"
  | "visible_in_guest"
  | "arrangement_status"
  | "reason"
  | "physical_rack_map"
  | "melody_target_range"
  | "accompaniment_target_range"
>;

export type AiSongRequestContext = {
  current_page?: "guest" | "voice" | "control" | "display" | "library-builder";
  conversation_state?: AiConversationState;
  pending_song_id?: string | null;
  pending_song_title?: string | null;
  last_unsupported_request?: string | null;
  current_song_id?: string | null;
  recent_suggested_song_ids?: string[];
  most_recent_candidate_song_id?: string | null;
  most_recent_assistant_intent?: AiSongRequestIntent | null;
  playback_state?: "idle" | "playing" | "paused" | "stopped";
  language?: "en" | "id";
  recent_messages?: Array<{ speaker: "assistant" | "user"; text: string }>;
};

export const SAFE_AI_SONG_REQUEST_FALLBACK: AiSongRequestResult = {
  intent: "unknown",
  matched_song_id: null,
  confidence: 0,
  spoken_response: "I did not understand that clearly. You can ask about Angklobot, angklung, or the songs I can play.",
  speech_text: "I did not understand that clearly. You can ask about Angklobot, angklung, or the songs I can play.",
  assistant_message: "I did not understand that clearly. You can ask about Angklobot, angklung, or the songs I can play.",
  should_search_catalog: false,
  should_generate_schedule: false,
  needs_confirmation: false,
  needs_operator_review: false,
  next_state: "awaiting_song",
  suggested_song_ids: [],
  last_unsupported_request: null,
  provider: "local_fallback",
  fallback_reason: null,
  model: null,
  pre_router_decision: null,
  raw_provider_result: null,
  knowledge_sections: [],
};

const PASSIVE_INTENTS: AiSongRequestIntent[] = [
  "greeting",
  "general_chat",
  "question_about_machine",
  "question_about_angklung",
  "smalltalk",
  "explain_limitation",
  "unknown",
];

export function toAiCatalogEntry(song: SongCatalogEntry): AiCatalogEntry {
  return {
    accompaniment_target_range: song.accompaniment_target_range,
    active: song.active,
    aliases: song.aliases,
    arrangement_status: song.arrangement_status,
    category: song.category,
    difficulty: song.difficulty,
    id: song.id,
    melody_target_range: song.melody_target_range,
    physical_rack_map: song.physical_rack_map,
    playable: song.playable,
    reason: song.reason,
    title: song.title,
    visible_in_guest: song.visible_in_guest,
  };
}

export function normalizeAiSongRequestResult(
  candidate: unknown,
  catalog: AiCatalogEntry[],
  provider: AiAssistantMode,
  fallbackReason?: string | null,
  context: AiSongRequestContext = {},
): AiSongRequestResult | null {
  if (!candidate || typeof candidate !== "object") {
    return null;
  }

  const result = candidate as Partial<AiSongRequestResult>;
  if (!isIntent(result.intent) || typeof result.assistant_message !== "string") {
    return null;
  }

  const assistantText = safeVisitorText(result.assistant_message);
  const spokenText = safeVisitorText(result.spoken_response);
  const speechText = safeVisitorText(result.speech_text);
  if (!assistantText || hasInternalLeakage(result.spoken_response) || hasInternalLeakage(result.speech_text)) {
    return null;
  }

  const activeSongs = catalog.filter(isActiveVisibleSong);
  const activeIds = new Set(activeSongs.map((song) => song.id));
  const requestedMatchedId = typeof result.matched_song_id === "string" ? result.matched_song_id : null;
  const shouldSearchCatalog = PASSIVE_INTENTS.includes(result.intent) ? false : Boolean(result.should_search_catalog);
  const matchedSong = shouldSearchCatalog && requestedMatchedId ? activeSongs.find((song) => song.id === requestedMatchedId) ?? null : null;
  const suggestedSongIds = shouldSearchCatalog && Array.isArray(result.suggested_song_ids)
    ? result.suggested_song_ids.filter((id): id is string => typeof id === "string" && activeIds.has(id)).slice(0, 5)
    : [];
  const pendingSongIsValid = Boolean(
    context.pending_song_id && matchedSong?.id === context.pending_song_id && activeIds.has(context.pending_song_id),
  );
  const confirmedPlayback = result.intent === "confirmation_yes" && pendingSongIsValid;
  const confidentRequest = result.intent === "song_request" && Boolean(matchedSong) &&
    typeof result.confidence === "number" && result.confidence >= 0.9;
  const canGenerate = Boolean((confirmedPlayback || confidentRequest) && result.should_generate_schedule && result.needs_confirmation !== true);
  const needsConfirmation = Boolean(
    matchedSong && !canGenerate && (isMusicRequestIntent(result.intent) || result.intent === "suggest_song" || result.needs_confirmation),
  );
  const invalidPlayableClaim = Boolean(requestedMatchedId && !matchedSong) || Boolean(result.should_generate_schedule && !canGenerate);
  const normalizedIntent: AiSongRequestIntent = invalidPlayableClaim ? "unsupported_song" : result.intent;
  const safeBlockedMessage =
    "I cannot play that selection because it is not a validated active song. Please choose a song from my available library.";
  const assistantMessage = invalidPlayableClaim
    ? safeBlockedMessage
    : needsConfirmation && matchedSong
      ? `Did you mean ${matchedSong.title}? Say the song title to choose it.`
      : assistantText;

  return {
    assistant_message: assistantMessage,
    confidence: clampConfidence(typeof result.confidence === "number" ? result.confidence : 0),
    fallback_reason: fallbackReason ?? null,
    intent: normalizedIntent,
    last_unsupported_request:
      typeof result.last_unsupported_request === "string" ? result.last_unsupported_request : context.last_unsupported_request ?? null,
    matched_song_id: matchedSong?.id ?? null,
    needs_confirmation: needsConfirmation,
    needs_operator_review: Boolean(result.needs_operator_review) || invalidPlayableClaim,
    next_state: invalidPlayableClaim
      ? "unsupported"
      : needsConfirmation
        ? "awaiting_confirmation"
        : canGenerate
          ? "ready_to_play"
          : isConversationState(result.next_state)
            ? result.next_state
            : "awaiting_song",
    provider,
    model: typeof result.model === "string" ? result.model : null,
    pre_router_decision: isPreRouterDecision(result.pre_router_decision) ? result.pre_router_decision : null,
    raw_provider_result: typeof result.raw_provider_result === "string" ? result.raw_provider_result.slice(0, 4000) : null,
    knowledge_sections: Array.isArray(result.knowledge_sections)
      ? result.knowledge_sections.filter((section): section is string => typeof section === "string").slice(0, 8)
      : [],
    should_generate_schedule: canGenerate,
    should_search_catalog: shouldSearchCatalog,
    spoken_response:
      spokenText && !invalidPlayableClaim
        ? spokenText
        : assistantMessage,
    speech_text:
      speechText && !invalidPlayableClaim
        ? speechText
        : spokenText && !invalidPlayableClaim
          ? spokenText
          : assistantMessage,
    suggested_song_ids: suggestedSongIds,
  };
}

export function isPreRouterDecision(value: unknown): value is AiPreRouterDecision {
  return (
    value === "greeting" ||
    value === "smalltalk" ||
    value === "confirmation" ||
    value === "high_confidence_song_match" ||
    value === "ambiguous_song_match" ||
    value === "reference" ||
    value === "list_songs" ||
    value === "genre" ||
    value === "out_of_scope" ||
    value === "protected_internal_request" ||
    value === "transport_command"
  );
}

export function isConversationState(value: unknown): value is AiConversationState {
  return value === "idle" || value === "awaiting_song" || value === "awaiting_confirmation" || value === "ready_to_play" || value === "unsupported";
}

export function isPassiveConversationIntent(intent: AiSongRequestIntent): boolean {
  return PASSIVE_INTENTS.includes(intent) || intent === "confirmation_no";
}

export function isMusicRequestIntent(intent: AiSongRequestIntent): boolean {
  return ["song_request", "artist_request", "genre_request", "mood_request"].includes(intent);
}

export function isIntent(value: unknown): value is AiSongRequestIntent {
  return (
    value === "greeting" ||
    value === "general_chat" ||
    value === "question_about_machine" ||
    value === "question_about_angklung" ||
    value === "ask_capabilities" ||
    value === "list_songs" ||
    value === "song_request" ||
    value === "artist_request" ||
    value === "genre_request" ||
    value === "mood_request" ||
    value === "suggest_song" ||
    value === "confirmation_yes" ||
    value === "confirmation_no" ||
    value === "unsupported_song" ||
    value === "explain_limitation" ||
    value === "smalltalk" ||
    value === "unknown"
  );
}

function isActiveVisibleSong(song: AiCatalogEntry): boolean {
  return song.active !== false && song.playable !== false && song.visible_in_guest !== false;
}

function clampConfidence(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, value));
}

export function safeVisitorText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!text || text.length > 1200 || !/[\p{L}\p{N}]/u.test(text)) return null;
  return hasInternalLeakage(text) ? null : text;
}

function hasInternalLeakage(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const suspicious = [
    /\b(system|developer) (prompt|instructions?|message)\b/i,
    /\bresponse_?schema\b/i,
    /\bproject_?knowledge\b/i,
    /\b(active_visible_catalog|matched_song_id|should_generate_schedule|assistant_message)\b/i,
    /\b(angklobot-persona|angklung-basics|machine-architecture|rack-and-validation|song-library-rules|midi-conversion-process|wro-demo-explanation)\b/i,
    /return (strict )?json/i,
    /friendly,? confident,? concise,? and knowledgeable/i,
    /^\s*\{[\s\S]*\}\s*$/,
  ];
  return suspicious.some((pattern) => pattern.test(value));
}

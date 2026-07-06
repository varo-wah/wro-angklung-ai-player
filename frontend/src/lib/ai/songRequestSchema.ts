import type { SongCatalogEntry } from "../songTypes";

export type AiSongRequestIntent =
  | "play_song"
  | "suggest_song"
  | "ask_capabilities"
  | "unsupported_song"
  | "confirm_playback"
  | "reject_suggestion"
  | "cancel"
  | "smalltalk"
  | "unknown";

export type AiAssistantMode = "local_ollama" | "openai_optional" | "local_fallback";

export type AiConversationState = "idle" | "awaiting_song" | "awaiting_confirmation" | "ready_to_play" | "unsupported";

export type AiSongRequestResult = {
  intent: AiSongRequestIntent;
  matched_song_id: string | null;
  confidence: number;
  spoken_response: string;
  assistant_message: string;
  should_generate_schedule: boolean;
  needs_confirmation: boolean;
  needs_operator_review: boolean;
  next_state: AiConversationState;
  provider: AiAssistantMode;
  fallback_reason?: string;
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
  conversation_state?: AiConversationState;
  pending_song_id?: string | null;
  pending_song_title?: string | null;
  recent_messages?: Array<{ speaker: "assistant" | "user"; text: string }>;
};

export const SAFE_AI_SONG_REQUEST_FALLBACK: AiSongRequestResult = {
  intent: "unknown",
  matched_song_id: null,
  confidence: 0,
  spoken_response: "I could not process that request clearly. Try asking for one supported song by name.",
  assistant_message: "I could not process that request clearly. Try asking for one supported song by name.",
  should_generate_schedule: false,
  needs_confirmation: false,
  needs_operator_review: true,
  next_state: "awaiting_song",
  provider: "local_fallback",
};

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
  fallbackReason?: string,
): AiSongRequestResult | null {
  if (!candidate || typeof candidate !== "object") {
    return null;
  }

  const result = candidate as Partial<AiSongRequestResult>;
  if (!isIntent(result.intent) || typeof result.assistant_message !== "string") {
    return null;
  }

  const matchedSongId = typeof result.matched_song_id === "string" ? result.matched_song_id : null;
  const matchedSong = matchedSongId ? catalog.find((song) => song.id === matchedSongId) : null;
  const activeVisibleMatchedSong =
    matchedSong && matchedSong.active !== false && matchedSong.playable !== false && matchedSong.visible_in_guest !== false ? matchedSong : null;
  const confirmedPlayback = result.intent === "confirm_playback";
  const canGenerate = Boolean(
    activeVisibleMatchedSong && confirmedPlayback && result.should_generate_schedule && result.needs_confirmation !== true,
  );
  const needsConfirmation = Boolean(
    activeVisibleMatchedSong && !canGenerate && (result.intent === "play_song" || result.intent === "suggest_song" || result.needs_confirmation),
  );
  const assistantMessage =
    needsConfirmation && activeVisibleMatchedSong
      ? `I can play ${activeVisibleMatchedSong.title}. Do you want me to play it?`
      : result.assistant_message;

  return {
    assistant_message: assistantMessage,
    confidence: clampConfidence(typeof result.confidence === "number" ? result.confidence : 0),
    fallback_reason: fallbackReason,
    intent: activeVisibleMatchedSong || !matchedSongId ? result.intent : "unsupported_song",
    matched_song_id: activeVisibleMatchedSong?.id ?? null,
    needs_confirmation: needsConfirmation,
    needs_operator_review: Boolean(result.needs_operator_review),
    next_state: activeVisibleMatchedSong || !matchedSongId
      ? isConversationState(result.next_state)
        ? needsConfirmation
          ? "awaiting_confirmation"
          : result.next_state
        : canGenerate
          ? "ready_to_play"
          : needsConfirmation
            ? "awaiting_confirmation"
          : "awaiting_song"
      : "unsupported",
    provider,
    should_generate_schedule: canGenerate,
    spoken_response: typeof result.spoken_response === "string" ? result.spoken_response : assistantMessage,
  };
}

export function isConversationState(value: unknown): value is AiConversationState {
  return value === "idle" || value === "awaiting_song" || value === "awaiting_confirmation" || value === "ready_to_play" || value === "unsupported";
}

function isIntent(value: unknown): value is AiSongRequestIntent {
  return (
    value === "play_song" ||
    value === "suggest_song" ||
    value === "ask_capabilities" ||
    value === "unsupported_song" ||
    value === "confirm_playback" ||
    value === "reject_suggestion" ||
    value === "cancel" ||
    value === "smalltalk" ||
    value === "unknown"
  );
}

function clampConfidence(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, value));
}

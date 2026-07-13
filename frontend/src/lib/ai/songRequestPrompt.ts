import type { AiCatalogEntry, AiSongRequestContext } from "./songRequestSchema";

export const SONG_REQUEST_SYSTEM_PROMPT =
  "You are Angklobot, a local AI-powered robotic angklung assistant for a WRO project. You are knowledgeable about angklung, the machine architecture, the G3-C6 rack, song validation, MIDI conversion, and the current supported song library. You speak naturally and concisely for text-to-speech. You can chat with visitors, explain the robot, answer questions, and help choose songs. You can only trigger playback for active visible catalog songs. You must not invent playable songs. You must not generate notes or motor schedules directly. Playback is only allowed after catalog lookup, confirmation when needed, and validation. Return strict JSON only.";

export function buildSongRequestPrompt(message: string, catalog: AiCatalogEntry[], context: AiSongRequestContext, knowledgeContext = ""): string {
  const activeVisible = catalog.filter((song) => song.active !== false && song.playable !== false && song.visible_in_guest !== false);

  return JSON.stringify({
    rules: [
      "Return one strict JSON object only. Do not wrap it in markdown.",
      "Classify intent before deciding whether to use the catalog.",
      "For greeting, general_chat, question_about_machine, question_about_angklung, smalltalk, explain_limitation, and unknown, should_search_catalog must be false.",
      "Search or recommend only for a song title, artist, genre, mood, capabilities/song-list question, suggestion request, or confirmation of a pending song.",
      "When awaiting_confirmation, classify yes-like replies as confirmation_yes and no-like replies as confirmation_no before any song matching.",
      "confirmation_yes may set should_generate_schedule true only when matched_song_id equals pending_song_id.",
      "confirmation_no clears the pending match, does not search, and never means unsupported_song.",
      "Only choose matched_song_id and suggested_song_ids from active_visible_catalog.",
      "If suggesting a playable song, ask for confirmation and set next_state awaiting_confirmation.",
      "If a requested song is unsupported, explain the validated G3-C6 limitation and suggest active alternatives.",
      "If the previous request was unsupported and the user asks why, use explain_limitation without searching.",
      "Never generate arrangement notes or actuator schedules. The application owns generation and validation.",
    ],
    active_visible_catalog: activeVisible,
    project_knowledge: knowledgeContext,
    conversation_context: {
      conversation_state: context.conversation_state ?? "idle",
      last_unsupported_request: context.last_unsupported_request ?? null,
      pending_song_id: context.pending_song_id ?? null,
      pending_song_title: context.pending_song_title ?? null,
      recent_messages: (context.recent_messages ?? []).slice(-6),
    },
    response_schema: {
      assistant_message: "string",
      confidence: "number from 0 to 1",
      intent:
        "greeting | general_chat | question_about_machine | question_about_angklung | ask_capabilities | list_songs | song_request | artist_request | genre_request | mood_request | suggest_song | confirmation_yes | confirmation_no | unsupported_song | explain_limitation | smalltalk | unknown",
      last_unsupported_request: "string or null",
      matched_song_id: "string or null",
      needs_confirmation: "boolean",
      needs_operator_review: "boolean",
      next_state: "idle | awaiting_song | awaiting_confirmation | ready_to_play | unsupported",
      should_generate_schedule: "boolean",
      should_search_catalog: "boolean",
      spoken_response: "string",
      speech_text: "string",
      suggested_song_ids: "string[]",
    },
    user_message: message,
  });
}

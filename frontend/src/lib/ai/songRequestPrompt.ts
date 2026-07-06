import type { AiCatalogEntry, AiSongRequestContext } from "./songRequestSchema";

export const SONG_REQUEST_SYSTEM_PROMPT =
  "You are Angklobot, the song request assistant for a WRO angklung robot website. You can only select songs from the provided catalog. You must not invent playable songs. You must not generate notes. You must not generate actuator schedules. You return strict JSON only.";

export function buildSongRequestPrompt(message: string, catalog: AiCatalogEntry[], context: AiSongRequestContext): string {
  const activeVisible = catalog.filter((song) => song.active !== false && song.playable !== false && song.visible_in_guest !== false);
  const inactiveOrUnplayable = catalog.filter((song) => song.active === false || song.playable === false);

  return JSON.stringify({
    allowed_actions: [
      "Return one strict JSON object only. Do not wrap it in markdown.",
      "Classify the user message first as greeting, ask_capabilities, song_request, confirmation_yes, confirmation_no, unsupported_song, smalltalk, or unknown.",
      "Prioritize confirmation handling over song matching whenever conversation_state is awaiting_confirmation and pending_song_id exists.",
      "Only choose matched_song_id from active_visible catalog songs unless explaining an inactive song.",
      "Never invent playable songs.",
      "Never generate arrangement notes.",
      "Never generate actuator schedules.",
      "If the user says hello, hi, yo, hey, what's up, who are you, or similar, set intent smalltalk or ask_capabilities; do not treat it as unsupported_song.",
      "If suggesting a playable song, ask for confirmation before schedule generation unless the user is confirming a pending song.",
      "If the user confirms yes and pending_song_id exists, set intent confirm_playback and should_generate_schedule true.",
      "If the user says no, nah, nope, not that, cancel, nevermind, choose another, or another one while awaiting confirmation, clear the match, set intent reject_suggestion or cancel, and next_state awaiting_song.",
      "If the requested song is unsupported, suggest 2 or 3 active_visible alternatives.",
      "If asked for capabilities or available songs, list active_visible titles.",
    ],
    catalog: {
      active_visible: activeVisible,
      inactive_or_unplayable: inactiveOrUnplayable,
    },
    conversation_context: {
      conversation_state: context.conversation_state ?? "idle",
      pending_song_id: context.pending_song_id ?? null,
      pending_song_title: context.pending_song_title ?? null,
      recent_messages: (context.recent_messages ?? []).slice(-6),
    },
    response_schema: {
      assistant_message: "string",
      confidence: "number from 0 to 1",
      intent: "play_song | suggest_song | ask_capabilities | unsupported_song | confirm_playback | reject_suggestion | cancel | smalltalk | unknown",
      matched_song_id: "string or null",
      needs_confirmation: "boolean",
      needs_operator_review: "boolean",
      next_state: "idle | awaiting_song | awaiting_confirmation | ready_to_play | unsupported",
      should_generate_schedule: "boolean",
      spoken_response: "string",
    },
    user_message: message,
  });
}

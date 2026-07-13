import type {
  AiCatalogEntry,
  AiPreRouterDecision,
  AiSongRequestContext,
  AiSongRequestIntent,
  AiSongRequestResult,
} from "./songRequestSchema";

export type AiPreRouterResult = {
  decision: AiPreRouterDecision;
  result: AiSongRequestResult;
};

export function routeSongRequestPreRouter(
  message: string,
  catalog: AiCatalogEntry[],
  context: AiSongRequestContext = {},
): AiPreRouterResult | null {
  const candidate = createLocalFallbackSongRequestResult(message, catalog, context);
  const decision = getPreRouterDecision(candidate);
  return decision ? { decision, result: { ...candidate, pre_router_decision: decision } } : null;
}

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
    return result({
      assistantMessage: `Great. I will play ${pendingSong.title} now.`,
      confidence: 0.97,
      fallbackReason,
      intent: "confirmation_yes",
      matchedSongId: pendingSong.id,
      nextState: "ready_to_play",
      shouldGenerateSchedule: true,
      shouldSearchCatalog: true,
    });
  }

  if (pendingSong && isNegative(normalizedMessage)) {
    const alternatives = activeSongs.filter((song) => song.id !== pendingSong.id).slice(0, 3);
    return result({
      assistantMessage: `No problem. I will not play that one. You could try ${formatSongList(alternatives)}.`,
      confidence: 0.96,
      fallbackReason,
      intent: "confirmation_no",
      nextState: "awaiting_song",
      shouldSearchCatalog: false,
      suggestedSongIds: alternatives.map((song) => song.id),
    });
  }

  if (context.last_unsupported_request && isLimitationFollowUp(normalizedMessage)) {
    return result({
      assistantMessage:
        "Because the robot only plays songs that have already been converted into safe G3-C6 angklung notes and validated for timing. Unsupported songs need MIDI or MusicXML conversion first.",
      confidence: 0.95,
      fallbackReason,
      intent: "explain_limitation",
      lastUnsupportedRequest: context.last_unsupported_request,
      nextState: "unsupported",
      shouldSearchCatalog: false,
    });
  }

  const exactCatalogMatch = findExactCatalogSong(normalizedMessage, activeSongs);
  if (exactCatalogMatch) {
    const assistantMessage = `I can play ${exactCatalogMatch.title}. Do you want me to start it?`;
    return result({
      assistantMessage,
      confidence: getMatchConfidence(normalizedMessage, exactCatalogMatch),
      intent: "song_request",
      matchedSongId: exactCatalogMatch.id,
      needsConfirmation: true,
      nextState: "awaiting_confirmation",
      shouldSearchCatalog: true,
      suggestedSongIds: [exactCatalogMatch.id],
    });
  }

  if (isGreeting(normalizedMessage)) {
    return result({
      assistantMessage: "Hi, I am Angklobot. I can talk with you and play songs from my validated angklung library.",
      confidence: 0.98,
      fallbackReason,
      intent: "greeting",
      nextState: "awaiting_song",
      shouldSearchCatalog: false,
    });
  }

  if (isAngklungQuestion(normalizedMessage)) {
    return result({
      assistantMessage:
        "An angklung is an Indonesian bamboo instrument. Each angklung produces a pitch when it is shaken, so ensembles coordinate different notes together. My version uses motors to trigger the rack automatically.",
      confidence: 0.97,
      fallbackReason,
      intent: "question_about_angklung",
      nextState: "awaiting_song",
      shouldSearchCatalog: false,
    });
  }

  if (isMachineQuestion(normalizedMessage)) {
    return result({
      assistantMessage:
        "I am Angklobot, a local AI-powered angklung robot. I help visitors choose a song from my validated library, check that it fits my G3-C6 rack, convert it into an actuator schedule, and play it on the motorized angklung machine.",
      confidence: 0.94,
      fallbackReason,
      intent: "question_about_machine",
      nextState: "awaiting_song",
      shouldSearchCatalog: false,
    });
  }

  if (isProjectDemoQuestion(normalizedMessage)) {
    return result({
      assistantMessage: getProjectDemoAnswer(normalizedMessage),
      confidence: 0.96,
      fallbackReason,
      intent: "question_about_machine",
      nextState: "awaiting_song",
      shouldSearchCatalog: false,
    });
  }

  if (isMidiQuestion(normalizedMessage)) {
    return result({
      assistantMessage:
        "MIDI contains actual notes, tracks, and timing, so I can identify melody and accompaniment, transpose them into my G3-C6 natural-note rack, validate them, and save a reviewed arrangement JSON. Dense MIDI still needs simplification before real motors.",
      confidence: 0.95,
      fallbackReason,
      intent: "question_about_machine",
      nextState: "awaiting_song",
      shouldSearchCatalog: false,
    });
  }

  if (isSongListQuestion(normalizedMessage)) {
    const titles = formatSongList(activeSongs);
    return result({
      assistantMessage: `I can play these validated songs: ${titles}.`,
      confidence: 0.98,
      fallbackReason,
      intent: "list_songs",
      nextState: "awaiting_song",
      shouldSearchCatalog: true,
      suggestedSongIds: activeSongs.slice(0, 5).map((song) => song.id),
    });
  }

  if (isCapabilityQuestion(normalizedMessage)) {
    const examples = activeSongs.slice(0, 5).map((song) => song.title).join(", ");
    return result({
      assistantMessage: `I can recommend and play songs that have already been converted for my G3-C6 angklung rack. You can ask by song, artist, mood, or genre. For example: ${examples}.`,
      confidence: 0.95,
      fallbackReason,
      intent: "ask_capabilities",
      nextState: "awaiting_song",
      shouldSearchCatalog: true,
      suggestedSongIds: activeSongs.slice(0, 5).map((song) => song.id),
    });
  }

  if (isGeneralChat(normalizedMessage)) {
    return result({
      assistantMessage: normalizedMessage.includes("how are you")
        ? "I am ready and operating normally. Ask me about the robot, angklung, or a song you would like to hear."
        : "Thanks. I am built to turn validated song arrangements into angklung motor schedules.",
      confidence: 0.9,
      fallbackReason,
      intent: "general_chat",
      nextState: "awaiting_song",
      shouldSearchCatalog: false,
    });
  }

  const musicIntent = classifyMusicIntent(normalizedMessage, activeSongs);
  if (!musicIntent) {
    return result({
      assistantMessage: "I can chat about Angklobot and angklung, or help you choose a validated song to play.",
      confidence: 0.58,
      fallbackReason,
      intent: "unknown",
      nextState: "awaiting_song",
      shouldSearchCatalog: false,
    });
  }

  const matchedSong = findFallbackSong(normalizedMessage, activeSongs, musicIntent);
  if (matchedSong) {
    const matchedTitle = matchedSong.id === "count_on_me" && normalizedMessage.includes("bruno")
      ? `${matchedSong.title} by Bruno Mars`
      : matchedSong.title;
    const assistantMessage = `I can play ${matchedTitle}. Do you want me to play it?`;
    return result({
      assistantMessage,
      confidence: getMatchConfidence(normalizedMessage, matchedSong),
      fallbackReason,
      intent: musicIntent,
      matchedSongId: matchedSong.id,
      needsConfirmation: true,
      needsOperatorReview: true,
      nextState: "awaiting_confirmation",
      shouldSearchCatalog: true,
      suggestedSongIds: [matchedSong.id],
    });
  }

  const suggestedSongs = activeSongs.slice(0, 3);
  const requestedTitle = extractRequestedTitle(message);
  const assistantMessage = `I do not have ${requestedTitle} in my validated angklung library yet. I can only play songs that have already been converted and checked for my G3-C6 rack. I can suggest ${formatSongList(suggestedSongs)}.`;
  return result({
    assistantMessage,
    confidence: 0.86,
    fallbackReason,
    intent: "unsupported_song",
    lastUnsupportedRequest: message.trim(),
    needsOperatorReview: true,
    nextState: "unsupported",
    shouldSearchCatalog: true,
    suggestedSongIds: suggestedSongs.map((song) => song.id),
  });
}

type ResultOptions = {
  assistantMessage: string;
  confidence: number;
  fallbackReason?: string;
  intent: AiSongRequestIntent;
  lastUnsupportedRequest?: string | null;
  matchedSongId?: string | null;
  needsConfirmation?: boolean;
  needsOperatorReview?: boolean;
  nextState: AiSongRequestResult["next_state"];
  shouldGenerateSchedule?: boolean;
  shouldSearchCatalog: boolean;
  suggestedSongIds?: string[];
};

function result(options: ResultOptions): AiSongRequestResult {
  return {
    assistant_message: options.assistantMessage,
    confidence: options.confidence,
    fallback_reason: options.fallbackReason ?? null,
    intent: options.intent,
    last_unsupported_request: options.lastUnsupportedRequest ?? null,
    matched_song_id: options.matchedSongId ?? null,
    needs_confirmation: options.needsConfirmation ?? false,
    needs_operator_review: options.needsOperatorReview ?? false,
    next_state: options.nextState,
    provider: "local_fallback",
    model: null,
    pre_router_decision: null,
    raw_provider_result: null,
    knowledge_sections: [],
    should_generate_schedule: options.shouldGenerateSchedule ?? false,
    should_search_catalog: options.shouldSearchCatalog,
    spoken_response: options.assistantMessage,
    speech_text: options.assistantMessage,
    suggested_song_ids: options.suggestedSongIds ?? [],
  };
}

function getPreRouterDecision(result: AiSongRequestResult): AiPreRouterDecision | null {
  if (result.intent === "confirmation_yes" || result.intent === "confirmation_no") return "confirmation";
  if (result.intent === "song_request" && result.matched_song_id) return "exact_catalog_match";
  if (result.intent === "list_songs" || result.intent === "ask_capabilities") return "list_songs";
  if (result.intent === "question_about_machine") return "machine_question";
  if (result.intent === "question_about_angklung") return "angklung_question";
  if (result.intent === "artist_request" || result.intent === "genre_request" || result.intent === "mood_request" || result.intent === "suggest_song") {
    return "catalog_recommendation";
  }
  if (result.intent === "unsupported_song") return "unsupported_song";
  if (result.intent === "explain_limitation") return "limitation_explanation";
  return null;
}

function findExactCatalogSong(message: string, songs: AiCatalogEntry[]): AiCatalogEntry | null {
  const candidates = songs
    .flatMap((song) => [song.title, ...(song.aliases ?? [])].map((phrase) => ({ phrase: normalizeText(phrase), song })))
    .filter(({ phrase }) => phrase.length >= 3)
    .sort((left, right) => right.phrase.length - left.phrase.length);
  return candidates.find(({ phrase }) => containsPhrase(message, phrase))?.song ?? null;
}

function containsPhrase(message: string, phrase: string): boolean {
  return message === phrase || ` ${message} `.includes(` ${phrase} `);
}

function classifyMusicIntent(message: string, songs: AiCatalogEntry[]): AiSongRequestIntent | null {
  const namesKnownToCatalog = songs.some(
    (song) => message === normalizeText(song.title) || (song.aliases ?? []).some((alias) => message === normalizeText(alias)),
  );
  if (namesKnownToCatalog) return "song_request";
  const hasMusicVerb = /\b(play|song|music|hear|listen|recommend|suggest)\b/.test(message);
  if (!hasMusicVerb) return null;
  if (/\b(happy|bright|cheerful|sad|calm|relaxing|energetic|romantic|emotional|upbeat|mood)\b/.test(message)) return "mood_request";
  if (/\b(pop|rock|jazz|classical|ballad|film|musical|genre)\b/.test(message)) return "genre_request";
  if (/\b(bruno mars|coldplay|ed sheeran|owl city|maroon 5|christina perri|elvis|charlie puth|wiz khalifa)\b/.test(message)) return "artist_request";
  return message.includes("suggest") || message.includes("recommend") ? "suggest_song" : "song_request";
}

function findFallbackSong(message: string, songs: AiCatalogEntry[], intent: AiSongRequestIntent): AiCatalogEntry | null {
  const directMatch = songs.find((song) => {
    const title = normalizeText(song.title);
    return message.includes(title) || (song.aliases ?? []).some((alias) => message.includes(normalizeText(alias)));
  });
  if (directMatch) return directMatch;

  const artistRules: Array<[string[], string]> = [
    [["bruno", "bruno mars"], "count_on_me"],
    [["coldplay", "viva"], "viva_la_vida"],
    [["aladdin", "whole new world"], "a_whole_new_world"],
    [["musescore", "midi perfect"], "perfect_musescore_ver"],
  ];
  const artistMatch = artistRules.find(([keywords]) => keywords.some((keyword) => message.includes(keyword)));
  if (artistMatch) return songs.find((song) => song.id === artistMatch[1]) ?? null;

  if (intent === "genre_request") {
    const requestedCategory = message.includes("musical") || message.includes("film") ? "musical_film" : message.includes("pop") ? "pop" : null;
    if (requestedCategory) return songs.find((song) => song.category?.includes(requestedCategory)) ?? null;
  }

  if (intent === "mood_request") {
    if (/happy|bright|cheerful|upbeat/.test(message)) {
      return songs.find((song) => /bright|school-friendly|cheerful|upbeat/i.test(song.reason ?? "")) ?? songs.find((song) => song.id === "count_on_me") ?? songs[0] ?? null;
    }
    if (/emotional|romantic|sad/.test(message)) {
      return (
        songs.find((song) => song.id === "a_thousand_years_christina_perri") ??
        songs.find((song) => song.id === "memories_maroon5") ??
        songs[0] ??
        null
      );
    }
    return songs[0] ?? null;
  }

  if (intent === "suggest_song") return songs[0] ?? null;
  return null;
}

function getMatchConfidence(message: string, song: AiCatalogEntry): number {
  const title = normalizeText(song.title);
  if (message.includes(title)) return 0.96;
  if ((song.aliases ?? []).some((alias) => message.includes(normalizeText(alias)))) return 0.93;
  return 0.84;
}

function isSongListQuestion(message: string): boolean {
  return /what (are the )?songs|what songs|which songs|list (the )?songs|available songs|songs can (you|u) play|what music do you know|what can (you|u) play/.test(message);
}

function isCapabilityQuestion(message: string): boolean {
  return /what can (you|u) do|your capabilities|what are you able/.test(message);
}

function isMachineQuestion(message: string): boolean {
  return /what can this machine do|how do you work|how does (this |the )?(robot|machine|angklobot) (work|play angklung)|how are you built|how do the motors|what are you|what is angklobot|explain (the )?robot/.test(message);
}

function isProjectDemoQuestion(message: string): boolean {
  return /what makes this ai|what makes this robotics|youtube|wro|judge|demo|why local (ai|ollama)|run offline/.test(message);
}

function getProjectDemoAnswer(message: string): string {
  if (message.includes("youtube")) {
    return "YouTube reference mode is planned, but I cannot currently play arbitrary YouTube music. Current playback requires an arrangement already converted into my validated catalog and checked for the G3-C6 rack.";
  }
  if (message.includes("robotics")) {
    return "The robotics is the motorized angklung actuation pipeline: a validated arrangement becomes a timed actuator schedule, and the physical driver will use those commands to trigger the 18-note rack safely.";
  }
  if (message.includes("ai")) {
    return "Local Ollama is my conversational brain for interpreting requests and explaining the project, while deterministic routing grounds song and safety commands. The AI can suggest, but catalog lookup and validation decide what may play.";
  }
  return "For WRO, I demonstrate local AI conversation connected to a validated robotic music pipeline. A laptop can interpret requests offline, select approved arrangements, validate them, and drive the simulator now and the motorized angklung rack later.";
}

function isMidiQuestion(message: string): boolean {
  return /midi|musicxml|music xml|convert (a )?song|conversion process|transpose|why.*pdf/.test(message);
}

function isAngklungQuestion(message: string): boolean {
  return /what is (an )?angklung|tell me about (the )?angklung|how does (an )?angklung/.test(message);
}

function isGreeting(message: string): boolean {
  return /^(hello|hi|hey|yo|good morning|good afternoon|good evening)( there)?$/.test(message);
}

function isGeneralChat(message: string): boolean {
  return /^(how are you|that s cool|thats cool|cool|nice|awesome|thank you|thanks|who are you|what s up|whats up)[.!?]*$/.test(message);
}

function isLimitationFollowUp(message: string): boolean {
  return /^(why|why not|how come|why can t you|why cant you)[?]*$/.test(message);
}

function isAffirmative(message: string): boolean {
  return /^(yes|yeah|yep|sure|ok|okay|bet)(\b|$)/.test(message) || ["confirm", "play it", "go ahead", "do it", "lets go", "let s go"].includes(message);
}

function isNegative(message: string): boolean {
  return /^(no|nah|nope)(\b|$)/.test(message) || ["not that", "cancel", "nevermind", "never mind", "choose another", "another one", "stop", "don t", "do not"].includes(message);
}

function extractRequestedTitle(message: string): string {
  const cleaned = message
    .trim()
    .replace(/^(?:(?:why\s+(?:can'?t|can\s+t|cannot)\s+you|can\s+you|could\s+you)\s+)?(?:please\s+)?(?:play|recommend|suggest)\s+/i, "")
    .replace(/[?!.,]+$/g, "")
    .trim();
  return cleaned ? cleaned.replace(/\b\w/g, (letter) => letter.toUpperCase()) : "that song";
}

function formatSongList(songs: AiCatalogEntry[]): string {
  return songs.map((song) => song.title).join(", ") || "no songs at the moment";
}

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

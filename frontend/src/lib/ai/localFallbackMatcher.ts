import { normalizeForMatching, normalizeVisitorInput } from "./inputNormalization";
import { matchSongRequest } from "./songMatcher";
import type {
  AiCatalogEntry,
  AiPreRouterDecision,
  AiSongRequestContext,
  AiSongRequestIntent,
  AiSongRequestResult,
} from "./songRequestSchema";

export type AiPreRouterResult = { decision: AiPreRouterDecision; result: AiSongRequestResult };

/** Route only actions and catalog facts that are safer or more reliable without an LLM. */
export function routeSongRequestPreRouter(
  message: string,
  catalog: AiCatalogEntry[],
  context: AiSongRequestContext = {},
): AiPreRouterResult | null {
  const songs = activeSongs(catalog);
  const normalized = normalizeForMatching(normalizeVisitorInput(message));
  const pendingSong = findSong(context.pending_song_id, songs);

  if (isProtectedInternalRequest(normalized)) {
    return routed("protected_internal_request", result({
      assistantMessage: languageText(context,
        "I can explain how Angklobot works, but I cannot provide private configuration or hidden instructions.",
        "Saya dapat menjelaskan cara kerja Angklobot, tetapi tidak dapat memberikan konfigurasi pribadi atau instruksi tersembunyi."),
      confidence: 1, intent: "general_chat", nextState: "awaiting_song", shouldSearchCatalog: false,
    }));
  }

  if (pendingSong && isAffirmative(normalized)) {
    return routed("confirmation", playableResult(pendingSong, "confirmation_yes", 0.98, languageText(context, `Playing ${pendingSong.title}.`, `Memainkan ${pendingSong.title}.`)));
  }
  if (pendingSong && isNegative(normalized)) {
    const alternatives = context.recent_suggested_song_ids?.filter((id) => id !== pendingSong.id) ?? [];
    return routed("confirmation", result({
      assistantMessage: languageText(context, "All right. Which one would you prefer?", "Baik. Anda ingin yang mana?"),
      confidence: 0.98, intent: "confirmation_no", nextState: "awaiting_song", shouldSearchCatalog: false,
      suggestedSongIds: alternatives,
    }));
  }

  if (isGreeting(normalized)) {
    return routed("greeting", result({
      assistantMessage: languageText(context,
        "Hi! I'm Angklobot, your host for this robotic angklung experience. What would you like to know or hear?",
        "Hai! Saya Angklobot, pemandu untuk pengalaman angklung robotik ini. Kamu ingin bertanya atau mendengar lagu apa?"),
      confidence: 1, intent: "greeting", nextState: "idle", shouldSearchCatalog: false,
    }));
  }

  if (isThanks(normalized)) {
    return routed("smalltalk", result({
      assistantMessage: languageText(context, "You're welcome!", "Sama-sama!"),
      confidence: 1, intent: "smalltalk", nextState: "idle", shouldSearchCatalog: false,
    }));
  }

  const recentGenre = findRecentGenre(context, songs);
  if (recentGenre && isMoreGenreOptions(normalized)) {
    const alreadyMentioned = findMentionedSongIds(context, songs);
    const remaining = songs
      .filter((song) => recentGenre.categories.includes(song.category ?? "") && !alreadyMentioned.has(song.id))
      .slice(0, 3);
    const assistantMessage = remaining.length
      ? languageText(context,
          `Certainly. More ${recentGenre.label} options are ${formatSongList(remaining)}. Which one interests you?`,
          `Tentu. Pilihan ${recentGenre.label} lainnya adalah ${formatSongList(remaining)}. Mana yang menarik bagi Anda?`)
      : languageText(context,
          `That is the complete ${recentGenre.label} selection currently prepared. Would you like another genre?`,
          `Itu seluruh pilihan ${recentGenre.label} yang saat ini sudah disiapkan. Apakah Anda ingin genre lain?`);
    return routed("genre", result({
      assistantMessage, confidence: 1, intent: "genre_request", nextState: "awaiting_song", shouldSearchCatalog: true,
      suggestedSongIds: remaining.map((song) => song.id),
    }));
  }

  if (recentGenre && isCurrentGenreFullListQuestion(normalized)) {
    const genreSongs = songs.filter((song) => recentGenre.categories.includes(song.category ?? ""));
    return routed("genre", result({
      assistantMessage: languageText(context,
        `The complete ${recentGenre.label} list is ${formatSongList(genreSongs)}. Say any title when you are ready.`,
        `Daftar lengkap ${recentGenre.label} adalah ${formatSongList(genreSongs)}. Sebutkan judul pilihan Anda.`),
      confidence: 1, intent: "genre_request", nextState: "awaiting_song", shouldSearchCatalog: true,
      suggestedSongIds: genreSongs.slice(0, 5).map((song) => song.id),
    }));
  }

  if (isGenreListQuestion(normalized)) {
    const genres = availableGenres(songs);
    return routed("genre", result({
      assistantMessage: languageText(context,
        `I currently have ${formatNaturalList(genres.map((genre) => genre.label), "or")}. Which genre sounds good?`,
        `Saat ini saya memiliki ${formatNaturalList(genres.map((genre) => genre.label), "atau")}. Genre mana yang Anda inginkan?`),
      confidence: 1, intent: "genre_request", nextState: "awaiting_song", shouldSearchCatalog: true,
    }));
  }

  const requestedGenre = findRequestedGenre(normalized, songs);
  if (requestedGenre) {
    const suggestions = songs.filter((song) => requestedGenre.categories.includes(song.category ?? "")).slice(0, 3);
    return routed("genre", result({
      assistantMessage: languageText(context,
        `For ${requestedGenre.label}, I suggest ${formatSongList(suggestions)}. Which one would you like to hear?`,
        `Untuk genre ${requestedGenre.label}, saya sarankan ${formatSongList(suggestions)}. Mana yang ingin Anda dengar?`),
      confidence: 1, intent: "genre_request", nextState: "awaiting_song", shouldSearchCatalog: true,
      suggestedSongIds: suggestions.map((song) => song.id),
    }));
  }

  const unavailableGenre = findUnavailableGenre(normalized);
  if (unavailableGenre) {
    const available = availableGenres(songs).map((genre) => genre.label);
    return routed("genre", result({
      assistantMessage: languageText(context,
        `I don't currently have ${unavailableGenre} prepared. My available genres are ${formatNaturalList(available, "or")}.`,
        `Saat ini saya belum memiliki genre ${unavailableGenre}. Genre yang tersedia adalah ${formatNaturalList(available, "atau")}.`),
      confidence: 1, intent: "genre_request", nextState: "awaiting_song", shouldSearchCatalog: true,
    }));
  }

  const referenced = resolveSongReference(normalized, songs, context);
  if (referenced) {
    return routed("reference", playableResult(referenced, "song_request", 0.96,
      languageText(context, `Playing ${referenced.title}.`, `Memainkan ${referenced.title}.`)));
  }

  if (isSongListQuestion(normalized)) {
    return routed("list_songs", result({
      assistantMessage: languageText(context, `I can play ${formatSongList(songs)}.`, `Saya dapat memainkan ${formatSongList(songs)}.`),
      confidence: 0.99, intent: "list_songs", nextState: "awaiting_song", shouldSearchCatalog: true,
      suggestedSongIds: songs.slice(0, 5).map((song) => song.id),
    }));
  }

  const match = matchSongRequest(normalized, songs);
  if (match.confidence === "high" && match.best) {
    return routed("high_confidence_song_match", playableResult(match.best.song, "song_request", match.best.score,
      languageText(context, `Playing ${match.best.song.title}.`, `Memainkan ${match.best.song.title}.`)));
  }
  if (match.confidence === "medium" && match.candidates.length) {
    const choices = match.candidates.map((candidate) => candidate.song);
    return routed("ambiguous_song_match", result({
      assistantMessage: languageText(context, `Which did you mean: ${formatSongList(choices)}?`, `Maksud Anda yang mana: ${formatSongList(choices)}?`),
      confidence: match.best?.score ?? 0.5, intent: "song_request",
      nextState: "awaiting_song", shouldSearchCatalog: true,
      suggestedSongIds: choices.map((song) => song.id),
    }));
  }

  if (isClearlyUnrelated(normalized, context)) {
    return routed("out_of_scope", result({
      assistantMessage: languageText(context,
        "I'm not sure I understand. You can ask me about Angklobot, angklung, or the music I can play.",
        "Saya kurang memahami maksud Anda. Anda dapat bertanya tentang Angklobot, angklung, atau musik yang dapat saya mainkan."),
      confidence: 1, intent: "unknown", nextState: "idle", shouldSearchCatalog: false,
    }));
  }

  return null;
}

/** Offline/provider-error behavior. This is deliberately small; normal conversation belongs to the LLM. */
export function createLocalFallbackSongRequestResult(
  message: string,
  catalog: AiCatalogEntry[],
  context: AiSongRequestContext = {},
  fallbackReason?: string,
): AiSongRequestResult {
  const routedResult = routeSongRequestPreRouter(message, catalog, context);
  if (routedResult) return { ...routedResult.result, fallback_reason: fallbackReason ?? null };

  const songs = activeSongs(catalog);
  const normalized = normalizeForMatching(normalizeVisitorInput(message));
  const indonesian = isIndonesian(normalized, context);
  const fallback = (english: string, bahasa: string, intent: AiSongRequestIntent = "general_chat") => result({
    assistantMessage: indonesian ? bahasa : english, confidence: 0.72, fallbackReason, intent,
    nextState: "awaiting_song", shouldSearchCatalog: false,
  });

  if (context.last_unsupported_request && /^(why|why not|how come|mengapa|kenapa)/.test(normalized)) {
    return fallback(
      "Because I can only play arrangements that are already prepared and validated for my angklung range.",
      "Karena saya hanya dapat memainkan aransemen yang sudah disiapkan dan divalidasi untuk rentang angklung saya.",
      "explain_limitation",
    );
  }
  if (/what is an? angklung|what is angklung|angklung itu apa|apa itu angklung/.test(normalized)) {
    return fallback(
      "An angklung is an Indonesian instrument made from tuned bamboo tubes. It sounds when the bamboo is shaken.",
      "Angklung adalah alat musik Indonesia dari tabung bambu bernada yang berbunyi saat digoyangkan.",
      "question_about_angklung",
    );
  }
  if (/what are you|who are you|what is angklobot|apa itu angklobot|siapa kamu/.test(normalized)) {
    return fallback(
      "I am Angklobot, an AI-assisted robot that turns prepared music into validated angklung performances.",
      "Saya Angklobot, robot berbantuan AI yang mengubah musik yang sudah disiapkan menjadi pertunjukan angklung tervalidasi.",
      "question_about_machine",
    );
  }
  if (/how do you work|how does.*work|cara kerja|bagaimana.*bekerja/.test(normalized)) {
    return fallback(
      "I interpret your request, check the prepared song catalog, build and validate a schedule, then the playback system performs it. The AI never controls motors directly.",
      "Saya memahami permintaan Anda, memeriksa katalog lagu, membuat dan memvalidasi jadwal, lalu sistem pemutaran menjalankannya. AI tidak mengendalikan motor secara langsung.",
      "question_about_machine",
    );
  }
  if (/motor|phone|ponsel|telepon|made you|membuatmu|berapa.*angklung|how many.*angklung/.test(normalized)) {
    return fallback(
      "I cannot reach the local conversational model just now. Please ask that again when it is available.",
      "Model percakapan lokal sedang tidak tersedia. Silakan tanyakan lagi setelah tersambung.",
    );
  }
  if (hasExplicitPlayIntent(normalized)) {
    const requested = extractRequestedTitle(message);
    return result({
      assistantMessage: indonesian
        ? `Saya belum memiliki ${requested}. Saya hanya dapat memainkan lagu yang sudah disiapkan. Pilihan yang tersedia antara lain ${formatSongList(songs.slice(0, 3))}.`
        : `I do not have ${requested} prepared yet. I can only play songs already in my catalog. You could try ${formatSongList(songs.slice(0, 3))}.`,
      confidence: 0.86, fallbackReason, intent: "unsupported_song", lastUnsupportedRequest: message.trim(),
      nextState: "unsupported", shouldSearchCatalog: true, suggestedSongIds: songs.slice(0, 3).map((song) => song.id),
    });
  }

  return fallback(
    "I did not understand that clearly. Could you rephrase it?",
    "Saya belum memahami itu dengan jelas. Bisakah Anda mengatakannya dengan cara lain?",
    "unknown",
  );
}

function playableResult(song: AiCatalogEntry, intent: AiSongRequestIntent, confidence: number, assistantMessage: string): AiSongRequestResult {
  return result({ assistantMessage, confidence, intent, matchedSongId: song.id, nextState: "ready_to_play",
    shouldGenerateSchedule: true, shouldSearchCatalog: true });
}

function resolveSongReference(message: string, songs: AiCatalogEntry[], context: AiSongRequestContext): AiCatalogEntry | null {
  const suggestedIds = context.recent_suggested_song_ids ?? [];
  if (/^(?:play|start|mainkan|putar|mulai)$/.test(message)) return findSong(context.current_song_id, songs);
  const ordinal = /\b(?:first|1st|pertama)\b/.test(message) ? 0
    : /\b(?:second|2nd|kedua)\b/.test(message) ? 1
      : /\b(?:third|3rd|ketiga)\b/.test(message) ? 2 : null;
  if (ordinal !== null) return findSong(suggestedIds[ordinal], songs);
  if (/^(?:play )?(?:that (?:one|1)|that|it|yang itu|itu)(?: please)?$/.test(message)) {
    return findSong(context.most_recent_candidate_song_id ?? context.pending_song_id ?? suggestedIds[0], songs);
  }
  if (/^(?:no )?(?:the )?other (?:one|1)$|^yang lain$/.test(message)) {
    const excluded = context.most_recent_candidate_song_id ?? context.pending_song_id ?? context.current_song_id;
    return findSong(suggestedIds.find((id) => id !== excluded), songs);
  }
  return null;
}

function routed(decision: AiPreRouterDecision, requestResult: AiSongRequestResult): AiPreRouterResult {
  return { decision, result: { ...requestResult, pre_router_decision: decision } };
}

type ResultOptions = {
  assistantMessage: string; confidence: number; fallbackReason?: string; intent: AiSongRequestIntent;
  lastUnsupportedRequest?: string | null; matchedSongId?: string | null; needsConfirmation?: boolean;
  needsOperatorReview?: boolean; nextState: AiSongRequestResult["next_state"]; shouldGenerateSchedule?: boolean;
  shouldSearchCatalog: boolean; suggestedSongIds?: string[];
};

function result(options: ResultOptions): AiSongRequestResult {
  return {
    assistant_message: options.assistantMessage, confidence: options.confidence, fallback_reason: options.fallbackReason ?? null,
    intent: options.intent, last_unsupported_request: options.lastUnsupportedRequest ?? null,
    matched_song_id: options.matchedSongId ?? null, needs_confirmation: options.needsConfirmation ?? false,
    needs_operator_review: options.needsOperatorReview ?? false, next_state: options.nextState, provider: "local_fallback",
    model: null, pre_router_decision: null, raw_provider_result: null, knowledge_sections: [],
    should_generate_schedule: options.shouldGenerateSchedule ?? false, should_search_catalog: options.shouldSearchCatalog,
    spoken_response: options.assistantMessage, speech_text: options.assistantMessage,
    suggested_song_ids: options.suggestedSongIds ?? [],
  };
}

function activeSongs(catalog: AiCatalogEntry[]): AiCatalogEntry[] {
  return catalog.filter((song) => song.active !== false && song.playable !== false && song.visible_in_guest !== false);
}

function findSong(id: string | null | undefined, songs: AiCatalogEntry[]): AiCatalogEntry | null {
  return id ? songs.find((song) => song.id === id) ?? null : null;
}

function formatSongList(songs: AiCatalogEntry[]): string {
  const titles = songs.map((song) => song.title);
  return titles.length < 2 ? titles[0] ?? "no songs" : `${titles.slice(0, -1).join(", ")} or ${titles.at(-1)}`;
}

type GenreGroup = { categories: string[]; label: string; patterns: RegExp };

const GENRE_GROUPS: GenreGroup[] = [
  { categories: ["pop", "international_pop", "classic_pop"], label: "pop", patterns: /\bpop\b/ },
  { categories: ["indonesian_traditional", "sundanese_angklung_heritage"], label: "traditional Indonesian", patterns: /\btraditional|tradisional|sundanese|sunda\b/ },
  { categories: ["indonesian_modern"], label: "modern Indonesian", patterns: /\bmodern indonesian|indonesian modern|modern indonesia\b/ },
  { categories: ["indonesian_national"], label: "Indonesian national", patterns: /\bnational|nasional|patriotic|patriotik\b/ },
  { categories: ["instrumental"], label: "instrumental", patterns: /\binstrumental\b/ },
  { categories: ["musical_film"], label: "musical film", patterns: /\bmusical|film|movie|soundtrack\b/ },
];

function availableGenres(songs: AiCatalogEntry[]): GenreGroup[] {
  return GENRE_GROUPS.filter((genre) => songs.some((song) => genre.categories.includes(song.category ?? "")));
}

function isGenreListQuestion(message: string): boolean {
  return /\b(what|which|list|show|available|have|genres?|jenis|daftar|tersedia)\b.*\b(genres?|music|musik|jenis)\b|\bgenres?\b.*\b(have|available|ada|tersedia)\b/.test(message);
}

function findRequestedGenre(message: string, songs: AiCatalogEntry[]): GenreGroup | null {
  return availableGenres(songs).find((genre) => genre.patterns.test(message)) ?? null;
}

function findUnavailableGenre(message: string): string | null {
  const match = message.match(/\b(rock|jazz|classical|dangdut|folk|edm|electronic|hip hop|rap|r&b|reggae|country|metal)\b/);
  return match?.[1] ?? null;
}

function findRecentGenre(context: AiSongRequestContext, songs: AiCatalogEntry[]): GenreGroup | null {
  if (context.most_recent_assistant_intent !== "genre_request") return null;
  const recentUserMessages = (context.recent_messages ?? [])
    .filter((entry) => entry.speaker === "user")
    .map((entry) => normalizeForMatching(entry.text))
    .reverse();
  return recentUserMessages.map((entry) => findRequestedGenre(entry, songs)).find(Boolean) ?? null;
}

function findMentionedSongIds(context: AiSongRequestContext, songs: AiCatalogEntry[]): Set<string> {
  const assistantHistory = (context.recent_messages ?? [])
    .filter((entry) => entry.speaker === "assistant")
    .map((entry) => normalizeForMatching(entry.text))
    .join(" ");
  return new Set(songs.filter((song) => assistantHistory.includes(normalizeForMatching(song.title))).map((song) => song.id));
}

function isMoreGenreOptions(message: string): boolean {
  return /^(any more|more|more options|other options|anything else|more songs|show me more|ada lagi|pilihan lain|lainnya)[?.! ]*$/.test(message);
}

function isCurrentGenreFullListQuestion(message: string): boolean {
  return /\b(full|complete|entire) (?:genre )?list\b|\bevery (?:option|choice)\b|\bdaftar lengkap\b/.test(message);
}

function formatNaturalList(items: string[], conjunction: string): string {
  if (items.length < 2) return items[0] ?? "no genres";
  return `${items.slice(0, -1).join(", ")}, ${conjunction} ${items.at(-1)}`;
}

function isClearlyUnrelated(message: string, context: AiSongRequestContext): boolean {
  const domainTopic = /\b(angklobot|angklung|robot|machine|motor|actuator|ai|project|wro|website|page|screen|button|control|guest|voice|microphone|song|songs|music|play|listen|hear|artist|genre|pop|traditional|instrumental|musical|catalog|library|recommend|suggest|melody|bamboo|indonesia|sunda|whisper|ollama|lagu|musik|mainkan|putar|dengar|artis|rekomendasi|sarankan|suasana|bambu)\b/.test(message);
  if (domainTopic) return false;
  const conversationalAboutAssistant = /\b(who|what|how|why)\b.*\b(you|your)|\b(you|your)\b.*\b(work|made|created|can do|are)\b/.test(message);
  if (conversationalAboutAssistant) return false;
  const followUp = /^(why|why not|how come|explain|tell me more|more|simpler|what about|and|then|that|it|yes|no|okay|ok)\b/.test(message);
  return !(followUp && context.recent_messages?.length);
}

function isSongListQuestion(message: string): boolean {
  if (/recommend|suggest|mood|genre|something|rekomendasi|sarankan|suasana/.test(message)) return false;
  return /what (?:songs|music)|which songs|list .*songs|songs .*can .*play|all (?:the )?songs|every song|entire catalog|full song list|lagu apa|semua lagu|daftar lagu|lagu .*bisa .*mainkan/.test(message);
}

function isGreeting(message: string): boolean {
  return /^(hi|hello|hey|halo|hai|good (morning|afternoon|evening)|selamat (pagi|siang|sore|malam))[!. ]*$/.test(message);
}

function isThanks(message: string): boolean {
  return /^(thanks|thank you|thank you very much|no thanks|terima kasih|makasih)[!. ]*$/.test(message);
}

function isAffirmative(message: string): boolean {
  return /^(yes|yeah|yep|sure|ok|okay|confirm|go ahead|do it|ya|iya|boleh|silakan)$/.test(message);
}

function isNegative(message: string): boolean {
  return /^(no|nah|nope|no thanks|not that|cancel|never mind|tidak|bukan itu|batal)$/.test(message);
}

function hasExplicitPlayIntent(message: string): boolean {
  return /^(please |tolong )?(play|start|mainkan|putar|putarkan)\b/.test(message);
}

function isProtectedInternalRequest(message: string): boolean {
  const asksToReveal = /\b(repeat|reveal|show|print|give|tell|quote|copy|display|ulangi|tampilkan|berikan|bocorkan)\b/.test(message);
  const protectedMaterial = /\b(system prompt|developer instructions?|hidden instructions?|response schema|raw provider|project knowledge|internal prompt|prompt internal)\b/.test(message);
  return asksToReveal && protectedMaterial;
}

function extractRequestedTitle(message: string): string {
  return message.trim().replace(/^(please\s+|tolong\s+)?(play|start|mainkan|putar|putarkan)(\s+(the\s+)?(song|lagu))?\s+/i, "").replace(/[.!?]+$/, "") || "that song";
}

function isIndonesian(message: string, context: AiSongRequestContext): boolean {
  return context.language === "id" || /\b(apa|itu|mengapa|kenapa|bagaimana|mainkan|putar|tolong|lagu|saya|kamu|anda)\b/.test(message);
}

function languageText(context: AiSongRequestContext, english: string, bahasa: string): string {
  return context.language === "id" ? bahasa : english;
}

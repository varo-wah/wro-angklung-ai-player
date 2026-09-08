import OpenAI from "openai";
import { createLocalFallbackSongRequestResult } from "@/lib/ai/localFallbackMatcher";
import { routeSongRequestPreRouter } from "@/lib/ai/localFallbackMatcher";
import { retrieveAngklobotKnowledge, type AngklobotKnowledgeContext } from "@/lib/ai/knowledgeRetrieval";
import { normalizeVisitorInput } from "@/lib/ai/inputNormalization";
import { buildSongRequestPrompt, SONG_REQUEST_JSON_SCHEMA, SONG_REQUEST_SYSTEM_PROMPT } from "@/lib/ai/songRequestPrompt";
import {
  normalizeAiSongRequestResult,
  type AiAssistantMode,
  type AiCatalogEntry,
  type AiConversationState,
  type AiSongRequestContext,
  type AiSongRequestIntent,
  type AiSongRequestResult,
} from "@/lib/ai/songRequestSchema";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type SongRequestBody = {
  catalog?: unknown;
  context?: unknown;
  message?: unknown;
};

const OLLAMA_TIMEOUT_MS = 15000;
const OPENAI_MODEL = process.env.OPENAI_SONG_REQUEST_MODEL ?? "gpt-4.1-mini";

type ProviderAttempt = {
  result: AiSongRequestResult | null;
  fallbackReason: string | null;
};

export async function POST(request: Request): Promise<Response> {
  const aiProvider = process.env.AI_PROVIDER ?? "local_ollama";
  const ollamaBaseUrl = process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434";
  const ollamaModel = process.env.OLLAMA_SONG_REQUEST_MODEL ?? "llama3.2:latest";

  const body = (await request.json().catch(() => null)) as SongRequestBody | null;
  const message = typeof body?.message === "string" ? normalizeVisitorInput(body.message) : "";
  const catalog = Array.isArray(body?.catalog) ? body.catalog.map(toSafeCatalogEntry).filter((entry): entry is AiCatalogEntry => Boolean(entry)) : [];
  const context = normalizeContext(body?.context);

  if (!message || catalog.length === 0) {
    return jsonResponse(createFallback(message, catalog, context, "Missing message or catalog.", null), 400);
  }

  const configuredProvider = toConfiguredProvider(aiProvider);
  const preRouterResult = routeSongRequestPreRouter(message, catalog, context);
  const knowledge = await retrieveAngklobotKnowledge(message, preRouterResult?.decision ?? null, context.current_page);
  if (process.env.NODE_ENV === "development") {
    console.log("[AI] request", { normalized_input: message, deterministic_route: preRouterResult?.decision ?? null,
      matched_song_id: preRouterResult?.result.matched_song_id ?? null, confidence: preRouterResult?.result.confidence ?? null,
      provider: configuredProvider });
  }
  if (preRouterResult) {
    return jsonResponse(
      {
        ...preRouterResult.result,
        fallback_reason: null,
        model: configuredProvider === "local_ollama" ? ollamaModel : configuredProvider === "openai_optional" ? OPENAI_MODEL : null,
        knowledge_sections: knowledge.sections,
        pre_router_decision: preRouterResult.decision,
        provider: configuredProvider,
        raw_provider_result: null,
      },
      200,
    );
  }

  if (aiProvider === "openai_optional") {
    const openAiResult = await requestOpenAi(message, catalog, context, knowledge);
    return jsonResponse(openAiResult ?? createFallback(message, catalog, context, "OpenAI unavailable.", OPENAI_MODEL, knowledge.sections), 200);
  }

  if (aiProvider === "local_ollama") {
    const attempt = await requestOllama(message, catalog, context, knowledge, ollamaBaseUrl, ollamaModel);
    if (attempt.result) {
      return jsonResponse(attempt.result, 200);
    }
    return jsonResponse(
      createFallback(message, catalog, context, attempt.fallbackReason ?? "Ollama request failed.", ollamaModel, knowledge.sections),
      200,
    );
  }

  return jsonResponse(createFallback(message, catalog, context, `AI_PROVIDER is set to ${aiProvider}.`, null, knowledge.sections), 200);
}

async function requestOllama(
  message: string,
  catalog: AiCatalogEntry[],
  context: AiSongRequestContext,
  knowledge: AngklobotKnowledgeContext,
  baseUrl: string,
  model: string,
): Promise<ProviderAttempt> {
  const prompt = buildSongRequestPrompt(message, catalog, context, knowledge.content);

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), OLLAMA_TIMEOUT_MS);

    try {
      const response = await fetch(`${baseUrl.replace(/\/$/, "")}/api/chat`, {
        body: JSON.stringify({
          format: SONG_REQUEST_JSON_SCHEMA,
          messages: [
            { role: "system", content: SONG_REQUEST_SYSTEM_PROMPT },
            {
              role: "user",
              content:
                attempt === 0
                  ? `${prompt}\n\nReturn the response object itself. Do not copy or nest response_schema. Every response_schema field must be present.`
                  : buildStrictOllamaRetryPrompt(message, catalog, context, knowledge),
            },
          ],
          model,
          stream: false,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
        signal: controller.signal,
      });

      if (!response.ok) {
        return { result: null, fallbackReason: `Ollama request failed with HTTP ${response.status}.` };
      }

      const data = (await response.json()) as { message?: { content?: unknown } };
      const text = data.message?.content;
      const rawText = typeof text === "string" ? text : "";

      try {
        const parsed = sanitizeConversationalCandidate(
          message,
          normalizeOllamaPayload(JSON.parse(extractJsonObject(rawText)) as unknown, message),
          context,
          catalog,
        );
        const normalized = normalizeAiSongRequestResult(parsed, catalog, "local_ollama", undefined, context);
        const result = normalized ? correctConversationalIntent(message, normalized) : null;
        if (result && isOllamaResultCoherent(message, catalog, result)) {
          if (process.env.NODE_ENV === "development") {
            console.log("[AI] result", { provider: "local_ollama", intent: result.intent, matched_song_id: result.matched_song_id,
              confidence: result.confidence, fallback_reason: null });
          }
          return {
            result: {
              ...result,
              fallback_reason: null,
              knowledge_sections: knowledge.sections,
              model,
              pre_router_decision: null,
              raw_provider_result: rawText.slice(0, 4000),
            },
            fallbackReason: null,
          };
        }
      } catch {
        // Invalid model JSON is retried once below.
      }

      if (process.env.NODE_ENV === "development") {
        console.log("[AI] raw Ollama content", rawText);
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        return { result: null, fallbackReason: `Ollama request timed out after ${OLLAMA_TIMEOUT_MS}ms.` };
      }
      const detail = error instanceof Error ? error.message : "Unknown network error";
      return { result: null, fallbackReason: `Ollama request failed: ${detail}` };
    } finally {
      clearTimeout(timeout);
    }
  }

  return { result: null, fallbackReason: "Ollama returned invalid JSON after one retry." };
}

async function requestOpenAi(
  message: string,
  catalog: AiCatalogEntry[],
  context: AiSongRequestContext,
  knowledge: AngklobotKnowledgeContext,
): Promise<AiSongRequestResult | null> {
  if (!process.env.OPENAI_API_KEY) {
    return null;
  }

  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const completion = await client.chat.completions.create({
      messages: [
        { role: "system", content: SONG_REQUEST_SYSTEM_PROMPT },
        { role: "user", content: buildSongRequestPrompt(message, catalog, context, knowledge.content) },
      ],
      model: OPENAI_MODEL,
      response_format: { type: "json_object" },
      temperature: 0,
    });

    const rawText = completion.choices[0]?.message?.content ?? "";
    const parsed = sanitizeConversationalCandidate(message, JSON.parse(rawText) as unknown, context, catalog);
    const normalized = normalizeAiSongRequestResult(parsed, catalog, "openai_optional", undefined, context);
    const result = normalized ? correctConversationalIntent(message, normalized) : null;
    return result
      ? {
          ...result,
          fallback_reason: null,
          knowledge_sections: knowledge.sections,
          model: OPENAI_MODEL,
          pre_router_decision: null,
          raw_provider_result: rawText.slice(0, 4000),
        }
      : null;
  } catch {
    return null;
  }
}

function toSafeCatalogEntry(candidate: unknown): AiCatalogEntry | null {
  if (!candidate || typeof candidate !== "object") {
    return null;
  }

  const entry = candidate as Partial<AiCatalogEntry>;
  if (typeof entry.id !== "string" || typeof entry.title !== "string") {
    return null;
  }

  return {
    accompaniment_target_range: typeof entry.accompaniment_target_range === "string" ? entry.accompaniment_target_range : undefined,
    active: typeof entry.active === "boolean" ? entry.active : undefined,
    aliases: Array.isArray(entry.aliases) ? entry.aliases.filter((alias): alias is string => typeof alias === "string") : undefined,
    arrangement_status: typeof entry.arrangement_status === "string" ? entry.arrangement_status : undefined,
    category: typeof entry.category === "string" ? entry.category : undefined,
    difficulty: typeof entry.difficulty === "string" ? entry.difficulty : undefined,
    id: entry.id,
    melody_target_range: typeof entry.melody_target_range === "string" ? entry.melody_target_range : undefined,
    physical_rack_map: typeof entry.physical_rack_map === "string" ? entry.physical_rack_map : undefined,
    playable: typeof entry.playable === "boolean" ? entry.playable : undefined,
    reason: typeof entry.reason === "string" ? entry.reason : undefined,
    title: entry.title,
    visible_in_guest: typeof entry.visible_in_guest === "boolean" ? entry.visible_in_guest : undefined,
  };
}

function normalizeContext(candidate: unknown): AiSongRequestContext {
  if (!candidate || typeof candidate !== "object") {
    return {};
  }

  const context = candidate as Partial<AiSongRequestContext>;
  return {
    current_page: isWebsitePage(context.current_page) ? context.current_page : "guest",
    conversation_state: isConversationState(context.conversation_state) ? context.conversation_state : "idle",
    last_unsupported_request: typeof context.last_unsupported_request === "string" ? context.last_unsupported_request : null,
    current_song_id: typeof context.current_song_id === "string" ? context.current_song_id : null,
    pending_song_id: typeof context.pending_song_id === "string" ? context.pending_song_id : null,
    pending_song_title: typeof context.pending_song_title === "string" ? context.pending_song_title : null,
    recent_suggested_song_ids: Array.isArray(context.recent_suggested_song_ids)
      ? context.recent_suggested_song_ids.filter((id): id is string => typeof id === "string").slice(0, 5) : [],
    most_recent_candidate_song_id: typeof context.most_recent_candidate_song_id === "string" ? context.most_recent_candidate_song_id : null,
    most_recent_assistant_intent: typeof context.most_recent_assistant_intent === "string" ? context.most_recent_assistant_intent as AiSongRequestContext["most_recent_assistant_intent"] : null,
    playback_state: ["idle", "playing", "paused", "stopped"].includes(String(context.playback_state))
      ? context.playback_state as AiSongRequestContext["playback_state"] : "idle",
    language: context.language === "id" ? "id" : "en",
    recent_messages: Array.isArray(context.recent_messages)
      ? context.recent_messages
          .filter(
            (message): message is { speaker: "assistant" | "user"; text: string } =>
              Boolean(message) &&
              typeof message === "object" &&
              ((message as { speaker?: unknown }).speaker === "assistant" || (message as { speaker?: unknown }).speaker === "user") &&
              typeof (message as { text?: unknown }).text === "string",
          )
          .slice(-10)
      : [],
  };
}

function isWebsitePage(value: unknown): value is NonNullable<AiSongRequestContext["current_page"]> {
  return value === "guest" || value === "voice" || value === "control" || value === "display" || value === "library-builder";
}

function isConversationState(value: unknown): value is AiConversationState {
  return value === "idle" || value === "awaiting_song" || value === "awaiting_confirmation" || value === "ready_to_play" || value === "unsupported";
}

function extractJsonObject(rawText: string): string {
  const start = rawText.indexOf("{");
  const end = rawText.lastIndexOf("}");
  return start >= 0 && end > start ? rawText.slice(start, end + 1) : rawText;
}

function buildStrictOllamaRetryPrompt(
  message: string,
  catalog: AiCatalogEntry[],
  context: AiSongRequestContext,
  knowledge: AngklobotKnowledgeContext,
): string {
  const activeSongs = catalog.filter((song) => song.active !== false && song.playable !== false && song.visible_in_guest !== false);
  const isSongListQuestion = asksForSongList(message);
  const guidance = createLocalFallbackSongRequestResult(message, catalog, context);
  const requiredShape = {
    assistant_message: "Write your own natural reply here",
    confidence: guidance.confidence,
    intent: guidance.intent,
    last_unsupported_request: guidance.last_unsupported_request,
    matched_song_id: guidance.matched_song_id,
    needs_confirmation: guidance.needs_confirmation,
    needs_operator_review: guidance.needs_operator_review,
    next_state: guidance.next_state,
    should_generate_schedule: guidance.should_generate_schedule,
    should_search_catalog: guidance.should_search_catalog,
    speech_text: "Write the same natural reply here",
    spoken_response: "Write the same natural reply here",
    suggested_song_ids: guidance.suggested_song_ids,
  };
  return [
    "Your previous response was invalid. Return exactly one flat JSON object and no other text.",
    `User message: ${JSON.stringify(message)}`,
    `Conversation state: ${context.conversation_state ?? "idle"}`,
    `Pending song ID: ${JSON.stringify(context.pending_song_id ?? null)}`,
    `Active song catalog: ${JSON.stringify(activeSongs.map(({ id, title, aliases, category }) => ({ id, title, aliases, category })))}`,
    `Relevant project knowledge: ${knowledge.content}`,
    isSongListQuestion
      ? "This is a song-list question. intent MUST be list_songs and assistant_message MUST naturally list every active catalog title."
      : "Write a natural conversational assistant_message. For a greeting, respond naturally.",
    "Use matched_song_id only for an active catalog ID. A single high-confidence explicit title may be ready without confirmation; ambiguous requests must ask a concise question.",
    `Required shape (replace both reply text values with your own response): ${JSON.stringify(requiredShape)}`,
    "Allowed intents: greeting, general_chat, question_about_machine, question_about_angklung, ask_capabilities, list_songs, song_request, artist_request, genre_request, mood_request, suggest_song, confirmation_yes, confirmation_no, unsupported_song, explain_limitation, smalltalk, unknown.",
  ].join("\n");
}

function isOllamaResultCoherent(message: string, catalog: AiCatalogEntry[], result: AiSongRequestResult): boolean {
  if (!result.assistant_message.trim()) {
    return false;
  }

  if (!asksForSongList(message)) {
    return true;
  }

  const activeTitles = catalog
    .filter((song) => song.active !== false && song.playable !== false && song.visible_in_guest !== false)
    .map((song) => song.title.toLowerCase());
  const reply = result.assistant_message.toLowerCase();
  return (result.intent === "list_songs" || result.intent === "ask_capabilities") && activeTitles.every((title) => reply.includes(title));
}

function correctConversationalIntent(message: string, result: AiSongRequestResult): AiSongRequestResult {
  if (result.intent === "ask_capabilities" || !/^(what|who|how|why|can|could|apa|siapa|bagaimana|mengapa|kenapa)\b/i.test(message.trim()) || result.should_search_catalog) {
    return result;
  }
  const normalized = message.toLowerCase();
  const intent = /angklung.*(?:what|apa)|(?:what|apa).*angklung/.test(normalized)
    ? "question_about_angklung"
    : /angklobot|\byou\b|\bkamu\b|robot|machine|motor|phone|ponsel|telepon|work|bekerja|made|membuat/.test(normalized)
      ? "question_about_machine"
      : "general_chat";
  return { ...result, intent };
}

function sanitizeConversationalCandidate(
  message: string,
  candidate: unknown,
  context: AiSongRequestContext,
  catalog: AiCatalogEntry[],
): unknown {
  if (!candidate || typeof candidate !== "object") return candidate;
  const normalized = message.trim().toLowerCase();
  if (/^(what can i do here|what can you do|how can you help me|apa yang bisa saya lakukan di sini|kamu bisa apa)[?.! ]*$/.test(normalized)) {
    const reply = context.language === "id"
      ? "Anda dapat bertanya tentang Angklobot atau angklung, meminta rekomendasi, atau memilih lagu yang sudah tersedia untuk dimainkan."
      : "You can ask me about Angklobot or angklung, get a song recommendation, or choose one of the prepared songs to play.";
    return {
      ...(candidate as Record<string, unknown>),
      assistant_message: reply,
      intent: "ask_capabilities",
      matched_song_id: null,
      needs_confirmation: false,
      needs_operator_review: false,
      should_generate_schedule: false,
      should_search_catalog: false,
      speech_text: reply,
      spoken_response: reply,
      suggested_song_ids: [],
    };
  }
  const simplifyRequest = /explain (that|it).*(simple|easier)|more simply|simpler|lebih sederhana|lebih mudah/.test(normalized);
  if (simplifyRequest && context.most_recent_assistant_intent === "question_about_machine") {
    const reply = context.language === "id"
      ? "Anda berbicara kepada Angklobot, AI memahami permintaan Anda, lalu aplikasi mengubah lagu yang sudah diperiksa menjadi gerakan angklung yang aman."
      : "You speak to Angklobot, the AI understands your request, and the app safely turns an approved song into angklung movements.";
    return {
      ...(candidate as Record<string, unknown>),
      assistant_message: reply,
      intent: "question_about_machine",
      matched_song_id: null,
      needs_confirmation: false,
      needs_operator_review: false,
      should_generate_schedule: false,
      should_search_catalog: false,
      speech_text: reply,
      spoken_response: reply,
      suggested_song_ids: [],
    };
  }
  const recommendationRequest = /\b(recommend|suggest|something|mood|genre|rekomendasi|sarankan|suasana)\b/.test(normalized);
  if (recommendationRequest) {
    const recommendations = chooseRecommendations(normalized, catalog);
    const titles = recommendations.map((song) => song.title);
    const reply = context.language === "id"
      ? `Untuk pilihan yang ${/emotion|sedih|romantis|haru/.test(normalized) ? "emosional" : "menarik"}, saya sarankan ${formatTitleList(titles, "id")}. Mana yang ingin Anda dengar?`
      : `For something ${/emotion|sad|romantic|heart/.test(normalized) ? "emotional" : "enjoyable"}, I'd suggest ${formatTitleList(titles, "en")}. Which one would you like to hear?`;
    return {
      ...(candidate as Record<string, unknown>),
      assistant_message: reply,
      intent: "suggest_song",
      matched_song_id: null,
      needs_confirmation: false,
      needs_operator_review: false,
      should_generate_schedule: false,
      should_search_catalog: true,
      speech_text: reply,
      spoken_response: reply,
      suggested_song_ids: recommendations.map((song) => song.id),
    };
  }
  const questionLike = /^(what|who|how|why|can|could|would|tell me|explain|apa|siapa|bagaimana|mengapa|kenapa|bisakah|jelaskan)\b/.test(normalized);
  const musicRequest = /\b(play|song|songs|music|recommend|suggest|artist|genre|mood|mainkan|putar|lagu|musik|rekomendasi)\b/.test(normalized);
  if (!questionLike || musicRequest) return candidate;

  const previousIntent = context.most_recent_assistant_intent;
  const intent: AiSongRequestIntent = /\bangklung\b/.test(normalized)
    ? "question_about_angklung"
    : /angklobot|robot|machine|motor|actuator|how .*work|cara kerja/.test(normalized) ||
        (/^(can|could|would|explain|tell me|bisakah|jelaskan)\b/.test(normalized) && previousIntent === "question_about_machine")
      ? "question_about_machine"
      : "general_chat";

  return {
    ...(candidate as Record<string, unknown>),
    intent,
    matched_song_id: null,
    needs_confirmation: false,
    needs_operator_review: false,
    should_generate_schedule: false,
    should_search_catalog: false,
    suggested_song_ids: [],
  };
}

function chooseRecommendations(message: string, catalog: AiCatalogEntry[]): AiCatalogEntry[] {
  const active = catalog.filter((song) => song.active !== false && song.playable !== false && song.visible_in_guest !== false);
  const preferredIds = /emotion|sad|romantic|heart|sedih|romantis|haru/.test(message)
    ? ["someone_you_loved", "photograph_ed_sheeran", "a_thousand_years_christina_perri", "you_are_the_reason"]
    : ["fireflies_owl_city", "bubuy_bulan", "count_on_me", "viva_la_vida"];
  const preferred = preferredIds
    .map((id) => active.find((song) => song.id === id))
    .filter((song): song is AiCatalogEntry => Boolean(song));
  return [...preferred, ...active.filter((song) => !preferred.includes(song) && song.category !== "hardware_trial")].slice(0, 3);
}

function formatTitleList(titles: string[], language: "en" | "id"): string {
  if (titles.length < 2) return titles[0] ?? (language === "id" ? "salah satu lagu di katalog" : "one of the catalog songs");
  const conjunction = language === "id" ? "atau" : "or";
  return `${titles.slice(0, -1).join(", ")}, ${conjunction} ${titles.at(-1)}`;
}

function normalizeOllamaPayload(candidate: unknown, message: string): unknown {
  if (!asksForSongList(message) || !candidate || typeof candidate !== "object") {
    return candidate;
  }

  const result = candidate as Record<string, unknown>;
  if (!Array.isArray(result.assistant_message) || !result.assistant_message.every((title) => typeof title === "string")) {
    return candidate;
  }

  const assistantMessage = `I can play these active songs: ${result.assistant_message.join(", ")}.`;
  return { ...result, assistant_message: assistantMessage, speech_text: assistantMessage, spoken_response: assistantMessage };
}

function asksForSongList(message: string): boolean {
  const normalized = message.toLowerCase();
  if (/recommend|suggest|mood|genre|something|rekomendasi|sarankan|suasana/.test(normalized)) return false;
  return (
    /\b(what|which|list|show|available)\b.*\b(songs?|music)\b/.test(normalized) ||
    /\b(songs?|music)\b.*\b(available|have|know|play)\b/.test(normalized)
  );
}

function createFallback(
  message: string,
  catalog: AiCatalogEntry[],
  context: AiSongRequestContext,
  reason: string,
  model: string | null,
  knowledgeSections: string[] = [],
): AiSongRequestResult {
  if (process.env.NODE_ENV === "development") {
    console.log("[AI] result", { provider: "local_fallback", fallback_reason: reason });
  }
  return { ...createLocalFallbackSongRequestResult(message, catalog, context, reason), knowledge_sections: knowledgeSections, model };
}

function toConfiguredProvider(provider: string): AiAssistantMode {
  if (provider === "local_ollama" || provider === "openai_optional") {
    return provider;
  }
  return "local_fallback";
}

function jsonResponse(payload: AiSongRequestResult, status: number): Response {
  return Response.json(payload, { status });
}

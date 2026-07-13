import OpenAI from "openai";
import { createLocalFallbackSongRequestResult } from "@/lib/ai/localFallbackMatcher";
import { routeSongRequestPreRouter } from "@/lib/ai/localFallbackMatcher";
import { retrieveAngklobotKnowledge, type AngklobotKnowledgeContext } from "@/lib/ai/knowledgeRetrieval";
import { buildSongRequestPrompt, SONG_REQUEST_SYSTEM_PROMPT } from "@/lib/ai/songRequestPrompt";
import {
  normalizeAiSongRequestResult,
  type AiAssistantMode,
  type AiCatalogEntry,
  type AiConversationState,
  type AiSongRequestContext,
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

  if (process.env.NODE_ENV === "development") {
    console.log("[AI] provider", process.env.AI_PROVIDER);
    console.log("[AI] ollama base url", process.env.OLLAMA_BASE_URL);
    console.log("[AI] ollama model", process.env.OLLAMA_SONG_REQUEST_MODEL);
  }

  const body = (await request.json().catch(() => null)) as SongRequestBody | null;
  const message = typeof body?.message === "string" ? body.message.trim() : "";
  const catalog = Array.isArray(body?.catalog) ? body.catalog.map(toSafeCatalogEntry).filter((entry): entry is AiCatalogEntry => Boolean(entry)) : [];
  const context = normalizeContext(body?.context);

  if (!message || catalog.length === 0) {
    return jsonResponse(createFallback(message, catalog, context, "Missing message or catalog.", null), 400);
  }

  const configuredProvider = toConfiguredProvider(aiProvider);
  const preRouterResult = routeSongRequestPreRouter(message, catalog, context);
  const knowledge = await retrieveAngklobotKnowledge(message, preRouterResult?.decision ?? null);
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
          format: "json",
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
        const parsed = normalizeOllamaPayload(JSON.parse(extractJsonObject(rawText)) as unknown, message);
        const result = normalizeAiSongRequestResult(parsed, catalog, "local_ollama", undefined, context);
        if (result && isOllamaResultCoherent(message, catalog, result)) {
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
    const parsed = JSON.parse(rawText) as unknown;
    const result = normalizeAiSongRequestResult(parsed, catalog, "openai_optional", undefined, context);
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
    conversation_state: isConversationState(context.conversation_state) ? context.conversation_state : "idle",
    last_unsupported_request: typeof context.last_unsupported_request === "string" ? context.last_unsupported_request : null,
    pending_song_id: typeof context.pending_song_id === "string" ? context.pending_song_id : null,
    pending_song_title: typeof context.pending_song_title === "string" ? context.pending_song_title : null,
    recent_messages: Array.isArray(context.recent_messages)
      ? context.recent_messages
          .filter(
            (message): message is { speaker: "assistant" | "user"; text: string } =>
              Boolean(message) &&
              typeof message === "object" &&
              ((message as { speaker?: unknown }).speaker === "assistant" || (message as { speaker?: unknown }).speaker === "user") &&
              typeof (message as { text?: unknown }).text === "string",
          )
          .slice(-6)
      : [],
  };
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
    "Use matched_song_id only for an exact active catalog ID. Never claim playback is ready without confirmation of the pending song.",
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
    console.log("[AI] fallback reason", reason);
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

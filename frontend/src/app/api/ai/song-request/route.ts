import OpenAI from "openai";
import { createLocalFallbackSongRequestResult } from "@/lib/ai/localFallbackMatcher";
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

const AI_PROVIDER = process.env.AI_PROVIDER ?? "local_ollama";
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434";
const OLLAMA_MODEL = process.env.OLLAMA_SONG_REQUEST_MODEL ?? "llama3.2";
const OPENAI_MODEL = process.env.OPENAI_SONG_REQUEST_MODEL ?? "gpt-4.1-mini";

export async function POST(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => null)) as SongRequestBody | null;
  const message = typeof body?.message === "string" ? body.message.trim() : "";
  const catalog = Array.isArray(body?.catalog) ? body.catalog.map(toSafeCatalogEntry).filter((entry): entry is AiCatalogEntry => Boolean(entry)) : [];
  const context = normalizeContext(body?.context);

  if (!message || catalog.length === 0) {
    return jsonResponse(createLocalFallbackSongRequestResult(message, catalog, context, "Missing message or catalog."), 400);
  }

  const localShortcut = createLocalFallbackSongRequestResult(message, catalog, context);
  if (shouldUseLocalShortcut(localShortcut)) {
    return jsonResponse(localShortcut, 200);
  }

  if (AI_PROVIDER === "openai_optional") {
    const openAiResult = await requestOpenAi(message, catalog, context);
    return jsonResponse(openAiResult ?? createLocalFallbackSongRequestResult(message, catalog, context, "OpenAI unavailable."), 200);
  }

  if (AI_PROVIDER === "local_ollama") {
    const ollamaResult = await requestOllama(message, catalog, context);
    if (ollamaResult) {
      return jsonResponse(ollamaResult, 200);
    }
    return jsonResponse(createLocalFallbackSongRequestResult(message, catalog, context, "Ollama unavailable."), 200);
  }

  return jsonResponse(createLocalFallbackSongRequestResult(message, catalog, context, "AI provider set to local fallback."), 200);
}

async function requestOllama(message: string, catalog: AiCatalogEntry[], context: AiSongRequestContext): Promise<AiSongRequestResult | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(`${OLLAMA_BASE_URL.replace(/\/$/, "")}/api/generate`, {
      body: JSON.stringify({
        format: "json",
        model: OLLAMA_MODEL,
        prompt: `${SONG_REQUEST_SYSTEM_PROMPT}\n\n${buildSongRequestPrompt(message, catalog, context)}`,
        stream: false,
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
      signal: controller.signal,
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as { response?: unknown };
    const rawText = typeof payload.response === "string" ? payload.response : "";
    const parsed = JSON.parse(extractJsonObject(rawText)) as unknown;
    return normalizeAiSongRequestResult(parsed, catalog, "local_ollama");
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function requestOpenAi(message: string, catalog: AiCatalogEntry[], context: AiSongRequestContext): Promise<AiSongRequestResult | null> {
  if (!process.env.OPENAI_API_KEY) {
    return null;
  }

  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const completion = await client.chat.completions.create({
      messages: [
        { role: "system", content: SONG_REQUEST_SYSTEM_PROMPT },
        { role: "user", content: buildSongRequestPrompt(message, catalog, context) },
      ],
      model: OPENAI_MODEL,
      response_format: { type: "json_object" },
      temperature: 0,
    });

    const rawText = completion.choices[0]?.message?.content ?? "";
    const parsed = JSON.parse(rawText) as unknown;
    return normalizeAiSongRequestResult(parsed, catalog, "openai_optional");
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

function shouldUseLocalShortcut(result: AiSongRequestResult): boolean {
  return (
    result.intent === "smalltalk" ||
    result.intent === "ask_capabilities" ||
    result.intent === "confirm_playback" ||
    result.intent === "reject_suggestion" ||
    result.intent === "cancel"
  );
}

function jsonResponse(payload: AiSongRequestResult, status: number): Response {
  return Response.json(payload, { status });
}

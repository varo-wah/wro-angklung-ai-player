export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CHECK_TIMEOUT_MS = 2000;

type ServiceResult = {
  available: boolean;
};

type OllamaResult = ServiceResult & {
  model: string;
  modelAvailable: boolean;
};

export async function GET(): Promise<Response> {
  const whisperUrl = (process.env.WHISPER_SERVER_URL ?? "http://127.0.0.1:8080").replace(/\/$/, "");
  const ollamaUrl = (process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434").replace(/\/$/, "");
  const model = process.env.OLLAMA_SONG_REQUEST_MODEL ?? "llama3.2:latest";

  const [whisper, ollama] = await Promise.all([
    checkService(`${whisperUrl}/`),
    checkOllama(`${ollamaUrl}/api/tags`, model),
  ]);
  const ready = whisper.available && ollama.available && ollama.modelAvailable;

  return Response.json(
    {
      available: true,
      checkedAt: new Date().toISOString(),
      services: {
        ollama,
        whisper,
        website: { available: true },
      },
      status: ready ? "online" : "limited",
    },
    { headers: responseHeaders() },
  );
}

export async function OPTIONS(): Promise<Response> {
  return new Response(null, { status: 204, headers: responseHeaders() });
}

async function checkService(url: string): Promise<ServiceResult> {
  const response = await fetchWithTimeout(url);
  return { available: response?.ok === true };
}

async function checkOllama(url: string, model: string): Promise<OllamaResult> {
  const response = await fetchWithTimeout(url);
  if (!response?.ok) return { available: false, model, modelAvailable: false };

  const data = (await response.json().catch(() => null)) as { models?: Array<{ model?: string; name?: string }> } | null;
  const models = Array.isArray(data?.models) ? data.models : [];
  return {
    available: true,
    model,
    modelAvailable: models.some((entry) => entry.name === model || entry.model === model),
  };
}

async function fetchWithTimeout(url: string): Promise<Response | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CHECK_TIMEOUT_MS);
  try {
    return await fetch(url, { cache: "no-store", signal: controller.signal });
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function responseHeaders(): HeadersInit {
  return {
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "no-store",
  };
}

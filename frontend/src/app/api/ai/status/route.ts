export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  const baseUrl = (process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434").replace(/\/$/, "");
  const model = process.env.OLLAMA_SONG_REQUEST_MODEL ?? "llama3.2:latest";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1500);
  try {
    const response = await fetch(`${baseUrl}/api/tags`, { cache: "no-store", signal: controller.signal });
    const data = response.ok ? await response.json() : null;
    const available = response.ok && Array.isArray(data?.models);
    const modelAvailable = available && data.models.some((entry: { name?: string; model?: string }) => entry?.name === model || entry?.model === model);
    return Response.json(
      { available, provider: "local_ollama", model, modelAvailable },
      { status: available ? 200 : 503, headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      { available: false, provider: "local_ollama", model, modelAvailable: false },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  } finally {
    clearTimeout(timeout);
  }
}

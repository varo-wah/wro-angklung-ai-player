export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_AUDIO_BYTES = 1_000_000;
const TRANSCRIPTION_TIMEOUT_MS = 30000;

export async function POST(request: Request): Promise<Response> {
  const formData = await request.formData().catch(() => null);
  const audio = formData?.get("audio");
  const language = formData?.get("language");

  if (!(audio instanceof File) || (language !== "en" && language !== "id")) {
    return jsonResponse({ error: "A WAV recording and an English or Indonesian language selection are required." }, 400);
  }
  if (audio.type !== "audio/wav" && audio.type !== "audio/x-wav") {
    return jsonResponse({ error: "Only normalized WAV microphone recordings are accepted." }, 400);
  }
  if (audio.size === 0) {
    return jsonResponse({ error: "The microphone recording was empty." }, 422);
  }
  if (audio.size > MAX_AUDIO_BYTES) {
    return jsonResponse({ error: "The microphone recording exceeded the 15-second limit." }, 413);
  }

  const serviceUrl = (process.env.WHISPER_SERVER_URL ?? "http://127.0.0.1:8080").replace(/\/$/, "");
  const upstreamForm = new FormData();
  upstreamForm.append("file", audio, "angklobot-voice.wav");
  upstreamForm.append("language", language);
  upstreamForm.append(
    "prompt",
    language === "id"
      ? "Angklobot adalah robot angklung. Halo, lagu, musik, mainkan, berhenti, jeda, lanjutkan."
      : "Angklobot is an angklung robot. Hello, song, music, play, stop, pause, resume.",
  );
  upstreamForm.append("response_format", "json");
  upstreamForm.append("temperature", "0.0");
  upstreamForm.append("temperature_inc", "0.0");
  upstreamForm.append("translate", "false");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TRANSCRIPTION_TIMEOUT_MS);
  try {
    const response = await fetch(`${serviceUrl}/inference`, {
      body: upstreamForm,
      method: "POST",
      signal: controller.signal,
    });
    if (!response.ok) {
      return jsonResponse({ error: `Local transcription failed with HTTP ${response.status}.` }, 503);
    }
    const payload = (await response.json().catch(() => null)) as { text?: unknown } | null;
    const text = typeof payload?.text === "string" ? payload.text.trim() : "";
    if (!text) {
      return jsonResponse({ error: "No speech was recognized. Please try again." }, 422);
    }
    return jsonResponse({ engine: "whisper.cpp", language, text }, 200);
  } catch (error) {
    const detail = error instanceof Error && error.name === "AbortError" ? "Local transcription timed out." : "Local transcription service is not running.";
    return jsonResponse({ error: detail }, 503);
  } finally {
    clearTimeout(timeout);
  }
}

function jsonResponse(payload: unknown, status: number): Response {
  return Response.json(payload, {
    headers: { "Cache-Control": "no-store" },
    status,
  });
}

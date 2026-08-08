export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  const serviceUrl = (process.env.WHISPER_SERVER_URL ?? "http://127.0.0.1:8080").replace(/\/$/, "");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1500);
  try {
    const response = await fetch(`${serviceUrl}/`, { cache: "no-store", signal: controller.signal });
    return Response.json(
      { available: response.ok, engine: "whisper.cpp", languages: ["en", "id"] },
      { headers: { "Cache-Control": "no-store" }, status: response.ok ? 200 : 503 },
    );
  } catch {
    return Response.json(
      { available: false, engine: "whisper.cpp", languages: ["en", "id"] },
      { headers: { "Cache-Control": "no-store" }, status: 503 },
    );
  } finally {
    clearTimeout(timeout);
  }
}

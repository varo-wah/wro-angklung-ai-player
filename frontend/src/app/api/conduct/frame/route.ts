export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Camera frames are accepted only through the Mac's loopback Studio origin. */
export async function POST(request: Request) {
  const host = request.headers.get("host") ?? "";
  if (!/^(127\.0\.0\.1|localhost):\d+$/.test(host) ||
      request.headers.get("origin") !== `http://${host}`)
    return Response.json({ error: "Open Conduct on the Mac using localhost." }, { status: 403 });
  if (request.headers.get("content-type") !== "image/jpeg")
    return Response.json({ error: "Expected JPEG." }, { status: 415 });
  const reader = request.body?.getReader();
  if (!reader) return Response.json({ error: "Missing frame." }, { status: 400 });
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 300000) { await reader.cancel(); return Response.json({ error: "Frame too large." }, { status: 413 }); }
    chunks.push(value);
  }
  try {
    const reply = await fetch("http://127.0.0.1:8766/frame", {
      method: "POST", headers: { "Content-Type": "image/jpeg" },
      body: Buffer.concat(chunks), signal: AbortSignal.timeout(15000),
    });
    return new Response(await reply.text(), { status: reply.status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "YOLO service is offline. Start Studio with its launcher on this Mac." }, { status: 503 });
  }
}

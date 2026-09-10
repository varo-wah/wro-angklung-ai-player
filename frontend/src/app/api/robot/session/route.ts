import { NextResponse } from "next/server";
import { parseRobotAction, type RobotResult } from "@/lib/robotSession";
import { robotSessionStore as store, SessionError } from "@/lib/robotSessionStore";
import type { ArduinoConnectionState } from "@/lib/arduinoSerial";
import type { SyncedSystemSnapshot } from "@/lib/systemSync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
const tokenFor = (request: Request) => request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
const localNames = new Set(["localhost", "127.0.0.1", "[::1]"]);
function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) throw new SessionError("Browser origin required.", 403);
  const originUrl = new URL(origin);
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? new URL(request.url).host;
  if (originUrl.host !== host) throw new SessionError("Cross-origin commands are not allowed.", 403);
  return originUrl;
}
function failure(error: unknown) { return json({ error: error instanceof Error ? error.message : "Session request failed." }, error instanceof SessionError ? error.status : 400); }
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const token = tokenFor(request);
    const id = url.searchParams.get("id");
    return json(id ? store.result(token, id) : store.view(token || undefined, Number(url.searchParams.get("since") ?? -1)));
  } catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  try {
    const origin = sameOrigin(request);
    const raw = await request.text();
    if (raw.length > 2000000) throw new SessionError("Session payload too large.", 413);
    const body = JSON.parse(raw);
    const token = tokenFor(request);
    switch (body.op) {
      case "claim":
        if (!localNames.has(origin.hostname)) throw new SessionError("Enable the Mac controller from localhost in Chrome.", 403);
        return json(store.claim());
      case "pair":
        if (typeof body.code !== "string" || !/^\d{6}$/.test(body.code)) throw new SessionError("Enter the six-digit code shown on the Mac.", 400);
        return json(store.pair(body.code));
      case "release": store.release(token); return json({ ok: true });
      case "command":
        if (typeof body.id !== "string" || !/^[a-zA-Z0-9-]{1,80}$/.test(body.id)) throw new SessionError("Invalid command ID.", 400);
        return json(store.enqueue(token, body.id, parseRobotAction(body.action)));
      case "heartbeat": {
        const a = body.arduino;
        if (!a || !["unsupported", "disconnected", "connecting", "connected", "error"].includes(a.status) || !["unknown", "dry_run", "active"].includes(a.outputMode) || typeof a.message !== "string") throw new SessionError("Invalid Arduino status.", 400);
        const snapshot = body.snapshot;
        if (snapshot && (typeof snapshot.sourceTabId !== "string" || typeof snapshot.updatedAt !== "number" || !Array.isArray(snapshot.chatMessages) || typeof snapshot.playbackState !== "string")) throw new SessionError("Invalid controller snapshot.", 400);
        const acks = body.acknowledgements ?? [];
        if (!Array.isArray(acks) || acks.length > 20 || acks.some(ack => typeof ack.id !== "string" || typeof ack.result?.ok !== "boolean")) throw new SessionError("Invalid command acknowledgement.", 400);
        return json(store.heartbeat(token, a as ArduinoConnectionState, snapshot as SyncedSystemSnapshot | undefined, acks as { id: string; result: RobotResult }[], body.cancelOutstanding === true));
      }
      default: throw new SessionError("Unknown session operation.", 400);
    }
  } catch (error) { return failure(error); }
}

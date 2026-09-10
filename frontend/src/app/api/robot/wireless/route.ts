import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const localNames = new Set(["localhost", "127.0.0.1", "[::1]"]);
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

function checkLocal(request: Request, mutation = false) {
  // Enabled only in the dedicated loopback-bound dev:wireless process.
  if (process.env.ANGKLOBOT_WIRELESS_ENABLED !== "1") throw new Error("Open the Wi-Fi website at http://localhost:3002/control (npm run dev:wireless).");
  const url = new URL(request.url);
  const host = request.headers.get("host") || url.host;
  if (!localNames.has(new URL(`http://${host}`).hostname) || request.headers.has("cf-ray") || request.headers.has("cf-connecting-ip")) throw new Error("Wi-Fi control is available only on this Mac's localhost website.");
  const forwarded = request.headers.get("x-forwarded-host");
  if (forwarded && forwarded !== host) throw new Error("Forwarded Wi-Fi control is disabled.");
  if (mutation) {
    const origin = request.headers.get("origin");
    if (!origin || new URL(origin).host !== host || !localNames.has(new URL(origin).hostname)) throw new Error("Local same-origin browser request required.");
  }
}

function bridgeHost() {
  const host = process.env.ANGKLOBOT_BRIDGE_HOST || "172.20.10.3";
  const parts = host.split(".").map(Number);
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || parts.some(n => n < 0 || n > 255) ||
      !(parts[0] === 10 || parts[0] === 192 && parts[1] === 168 || parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)) throw new Error("Configure a private LAN IPv4 address in ANGKLOBOT_BRIDGE_HOST.");
  return host;
}

async function bridgeToken() {
  if (process.env.ANGKLOBOT_BRIDGE_TOKEN) return process.env.ANGKLOBOT_BRIDGE_TOKEN;
  try {
    const config = await readFile(path.resolve(process.cwd(), "../firmware/esp32/angklobot_bridge/bridge_config.h"), "utf8");
    const token = config.match(/^#define\s+BRIDGE_TOKEN\s+"([^"]+)"/m)?.[1];
    if (token && token.length >= 32) return token;
  } catch { /* Report configuration failure without exposing file contents. */ }
  throw new Error("Configure the ESP32 bridge token on this Mac.");
}

function permitted(line: string) {
  if (["HELLO,1", "PING", "STATUS", "ARM", "ALL_OFF", "DISARM", "ESTOP"].includes(line)) return true;
  if (line === "SCHED,CAPS") return true;
  if (/^SCHED,(?:RUN|KEEP),[1-9]\d{0,9}$/.test(line)) return true;
  if (/^SCHED,BEGIN,[1-9]\d{0,9},\d{1,4}$/.test(line)) return true;
  if (/^SCHED,ADD,[1-9]\d{0,9},\d{1,4},\d{1,7}:\d{1,2}:\d{1,4}:\d{1,4}(;\d{1,7}:\d{1,2}:\d{1,4}:\d{1,4}){0,31}$/.test(line)) return true;
  const note = /^NOTE,(\d{1,2}),(\d{1,4}),(\d{1,4})$/.exec(line);
  return Boolean(note && +note[1] <= 17 && +note[2] >= 1 && +note[2] <= 5000 && +note[3] <= 1000);
}

export async function GET(request: Request) {
  try { checkLocal(request); await bridgeToken(); return json({ host: bridgeHost() }); }
  catch (error) { return json({ error: error instanceof Error ? error.message : "Wi-Fi bridge unavailable." }, 403); }
}

export async function POST(request: Request) {
  try { checkLocal(request, true); }
  catch (error) { return json({ error: error instanceof Error ? error.message : "Local control required." }, 403); }
  try {
    if (!request.headers.get("content-type")?.startsWith("application/json")) return json({ error: "JSON command required." }, 400);
    const raw = await request.text();
    if (raw.length > 3000) return json({ error: "Command too large." }, 413);
    const { line } = JSON.parse(raw);
    if (typeof line !== "string" || !permitted(line)) return json({ error: "Unsupported bridge command." }, 400);
    const response = await fetch(`http://${bridgeHost()}/command`, {
      method: "POST", cache: "no-store", redirect: "error",
      headers: { Authorization: `Bearer ${await bridgeToken()}`, "Content-Type": "text/plain" },
      body: line + "\n", signal: AbortSignal.timeout(5000),
    });
    const reply = (await response.text()).trim();
    if (reply.length > 256 || /[\r\n]/.test(reply)) throw new Error("Malformed Mega response.");
    if (!response.ok) return json({ error: reply || "ESP32 rejected the command." }, response.status);
    return json({ line: reply });
  } catch (error) {
    return json({ error: error instanceof Error && error.name === "TimeoutError" ? "ESP32 response timed out. Check power and hotspot." : "ESP32 request failed. Check its IP, power, and hotspot." }, 502);
  }
}

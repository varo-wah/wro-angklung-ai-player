"use client";
import { useEffect, useRef, useState } from "react";
import type { ArduinoConnectionState } from "@/lib/arduinoSerial";
import type { SyncedSystemSnapshot } from "@/lib/systemSync";
import { HOST_LEASE_MS, OFFLINE_ROBOT, isInterrupt, type RobotAction, type RobotCommand, type RobotResult, type RobotStatus, type RobotView } from "@/lib/robotSession";

const ENDPOINT = "/api/robot/session";
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function api(body?: unknown, token = "", query = "") {
  const response = await fetch(ENDPOINT + query, {
    method: body ? "POST" : "GET", cache: "no-store",
    headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(2500),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? "Robot session unavailable.");
  return result;
}

type Options = {
  arduino: ArduinoConnectionState;
  snapshot: () => SyncedSystemSnapshot;
  applySnapshot: (snapshot: SyncedSystemSnapshot) => void;
  execute: (command: RobotCommand) => Promise<RobotResult>;
  halt: () => void;
  interrupt: () => void;
};
export function useRobotSession(options: Options) {
  const optionsRef = useRef(options); optionsRef.current = options;
  const [role, setRole] = useState<"viewer" | "host" | "remote">("viewer");
  const [status, setStatus] = useState<RobotStatus>(OFFLINE_ROBOT);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [serverAvailable, setServerAvailable] = useState(false);
  const credentials = useRef({ role: "viewer" as "viewer" | "host" | "remote", token: "" });
  const statusRef = useRef<RobotStatus>(OFFLINE_ROBOT);
  const revision = useRef(-1);
  const acknowledgements = useRef<{ id: string; result: RobotResult }[]>([]);
  const seen = useRef(new Set<string>());
  const executionEpoch = useRef(0);
  const lastSuccess = useRef(0);
  const active = useRef(false);
  const cancelVersion = useRef(0);
  const sentCancelVersion = useRef(0);

  useEffect(() => {
    active.current = true;
    let cancelled = false;
    try {
      const token = sessionStorage.getItem("angklobot.remote-token");
      if (token) { credentials.current = { role: "remote", token }; setRole("remote"); }
    } catch { /* Session still works without persistence. */ }
    async function tick() {
      while (!cancelled) {
        const identity = credentials.current;
        try {
          const acks = acknowledgements.current.slice();
          const cancellation = cancelVersion.current;
          const response = identity.role === "host"
            ? await api({ op: "heartbeat", arduino: optionsRef.current.arduino, snapshot: optionsRef.current.snapshot(), acknowledgements: acks, cancelOutstanding: cancellation !== sentCancelVersion.current }, identity.token)
            : await api(undefined, identity.token, `?since=${revision.current}`);
          if (cancelled || credentials.current !== identity) continue;
          lastSuccess.current = Date.now();
          setServerAvailable(true);
          setError(null);
          const view = response as RobotView;
          statusRef.current = view; setStatus(view);
          if (view.snapshot && view.revision !== revision.current && identity.role !== "host") optionsRef.current.applySnapshot(view.snapshot);
          revision.current = view.revision;
          if (identity.role === "host") {
            sentCancelVersion.current = cancellation;
            acknowledgements.current = acknowledgements.current.filter(ack => !acks.includes(ack));
            for (const command of response.commands as RobotCommand[]) {
              if (seen.current.has(command.id)) continue;
              if (cancellation !== cancelVersion.current) continue;
              seen.current.add(command.id);
              if (isInterrupt(command.action)) { executionEpoch.current++; optionsRef.current.interrupt(); }
              const epoch = executionEpoch.current;
              void optionsRef.current.execute(command).then(result => {
                if (!cancelled && credentials.current === identity && epoch === executionEpoch.current) acknowledgements.current.push({ id: command.id, result });
              }).catch(err => {
                if (!cancelled && credentials.current === identity && epoch === executionEpoch.current) acknowledgements.current.push({ id: command.id, result: { ok: false, error: err instanceof Error ? err.message : "Command failed." } });
              });
            }
          }
          if (!view.hostOnline && identity.role === "remote") { setError("Mac controller offline. Commands are disabled until it returns and you pair again."); }
        } catch (err) {
          if (cancelled || credentials.current !== identity) continue;
          setError(err instanceof Error ? err.message : "Robot server unavailable.");
          if (identity.role === "remote" && err instanceof Error && err.message.includes("Pair this device")) {
            credentials.current = { role: "viewer", token: "" }; setRole("viewer"); revision.current = -1;
            try { sessionStorage.removeItem("angklobot.remote-token"); } catch { /* Optional persistence. */ }
          }
          setServerAvailable(false);
          statusRef.current = OFFLINE_ROBOT; setStatus(OFFLINE_ROBOT);
          // A stopped server or expired lease cannot leave this tab sending notes.
          if (identity.role === "host" && Date.now() - lastSuccess.current >= HOST_LEASE_MS - 1000) {
            executionEpoch.current++; optionsRef.current.halt();
            credentials.current = { role: "viewer", token: "" }; setRole("viewer"); setCode("");
          }
        }
        await delay(500);
      }
    }
    void tick();
    return () => {
      cancelled = true; active.current = false; executionEpoch.current++;
      if (credentials.current.role === "host") optionsRef.current.halt();
    };
  }, []);

  async function enableHost() {
    const result = await api({ op: "claim" });
    credentials.current = { role: "host", token: result.token };
    lastSuccess.current = Date.now(); revision.current = -1; seen.current.clear(); acknowledgements.current = [];
    setRole("host"); setCode(result.code); setError(null);
  }
  async function releaseHost() {
    optionsRef.current.halt(); executionEpoch.current++;
    try { await api({ op: "release" }, credentials.current.token); }
    finally { credentials.current = { role: "viewer", token: "" }; setRole("viewer"); setCode(""); }
  }
  async function pair(pairingCode: string) {
    const result = await api({ op: "pair", code: pairingCode });
    credentials.current = { role: "remote", token: result.token }; revision.current = -1;
    setRole("remote"); setError(null);
    try { sessionStorage.setItem("angklobot.remote-token", result.token); } catch { /* Optional persistence. */ }
  }
  async function send(action: RobotAction): Promise<{ id: string; result: RobotResult }> {
    const identity = credentials.current;
    if (identity.role !== "remote") throw new Error("Enter the Mac pairing code to control Angklobot.");
    if (!statusRef.current.hostOnline || statusRef.current.arduino.status !== "connected") throw new Error("Mac or Arduino offline. Command was not sent.");
    const id = typeof crypto.randomUUID === "function" ? crypto.randomUUID()
      : Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, "0")).join("");
    await api({ op: "command", id, action }, identity.token);
    const deadline = Date.now() + 70000;
    while (active.current && credentials.current === identity && Date.now() < deadline) {
      const response = await api(undefined, identity.token, `?id=${id}`);
      if (response.state === "done") {
        if (!response.result.ok) throw new Error(response.result.error ?? "Command failed.");
        setError(null);
        return { id, result: response.result };
      }
      await delay(300);
    }
    throw new Error("Command confirmation timed out. Check the Mac before retrying.");
  }
  function cancelQueued() {
    if (credentials.current.role === "host") { cancelVersion.current++; executionEpoch.current++; optionsRef.current.interrupt(); }
  }
  return { cancelQueued, role, status, statusRef, credentials, code, error, serverAvailable, enableHost, releaseHost, pair, send };
}
export type RobotSession = ReturnType<typeof useRobotSession>;

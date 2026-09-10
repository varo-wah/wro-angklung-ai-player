"use client";
import { useEffect, useState } from "react";
import type { RobotSession } from "@/hooks/useRobotSession";

export function RobotSessionStatus({ session, onEnableHost, onConnect, onStop, connectionLabel = "Arduino USB" }: {
  connectionLabel?: string;
  session: RobotSession; onEnableHost: () => Promise<void>; onConnect: () => Promise<void>; onStop: () => void;
}) {
  const [pairingCode, setPairingCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [local, setLocal] = useState(false);
  useEffect(() => { setLocal(["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname)); }, []);
  const connected = session.status.hostOnline && session.status.arduino.status === "connected";
  const ready = connected && session.status.arduino.outputMode === "active";
  async function act(action: () => Promise<void>) {
    setBusy(true); setError(null);
    try { await action(); } catch (err) { setError(err instanceof Error ? err.message : "Connection failed."); }
    finally { setBusy(false); }
  }
  return <section aria-label="Robot connection" className="shrink-0 border-b border-white/10 bg-slate-950 px-3 py-2 text-xs text-slate-300">
    <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-2">
      <span role="status" className={ready ? "font-semibold text-emerald-300" : "font-semibold text-amber-200"}>
        {session.status.hostOnline ? connected ? ready ? "Angklobot connected" : "Arduino connected · dry run" : "Mac online · Arduino disconnected" : session.serverAvailable ? "Mac controller offline" : session.error ? "Robot server unavailable" : "Checking robot connection…"}
      </span>
      {session.status.hostOnline && <span>{session.status.sourceLabel || "No song selected"} · {session.status.playbackState}</span>}
      {session.role === "host" ? <>
        <span>This Mac controls {connectionLabel} · Pairing code: <strong className="tracking-widest text-lime-200">{session.code}</strong></span>
        {!connected && <button disabled={busy} onClick={() => void act(onConnect)} className="rounded bg-lime-300 px-3 py-2 font-semibold text-slate-950">Connect {connectionLabel}</button>}
        <button disabled={busy} onClick={() => void act(session.releaseHost)} className="rounded border border-white/20 px-3 py-2">Disable remote control</button>
      </> : <>
        {local && !session.status.hostOnline && <button disabled={busy} onClick={() => void act(onEnableHost)} className="rounded bg-lime-300 px-3 py-2 font-semibold text-slate-950">Enable Mac controller</button>}
        {session.role === "remote" && session.status.hostOnline && <span className="text-lime-200">Paired remote control</span>}
        {(session.role !== "remote" || !session.status.hostOnline || session.error) && <form className="flex items-center gap-2" onSubmit={event => { event.preventDefault(); void act(() => session.pair(pairingCode)); }}>
          <label className="sr-only" htmlFor="robot-pair-code">Mac pairing code</label>
          <input id="robot-pair-code" value={pairingCode} onChange={event => setPairingCode(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="off" placeholder="Mac code" maxLength={6} className="w-24 rounded border border-white/20 bg-black/30 px-2 py-2 text-white" />
          <button disabled={busy || !session.status.hostOnline || pairingCode.length !== 6} className="rounded border border-lime-300/40 px-3 py-2 text-lime-200 disabled:opacity-40">Pair device</button>
        </form>}
      </>}
      {(session.role === "host" || session.role === "remote") && <button onClick={onStop} className="rounded bg-red-600 px-3 py-2 font-semibold text-white">Stop robot</button>}
    </div>
    {(error || session.error) && <p role="alert" className="mx-auto mt-1 max-w-7xl text-amber-200">{error || session.error}</p>}
  </section>;
}

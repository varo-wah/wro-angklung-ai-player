"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { WhisperWakeListener } from "@/lib/wakeWord";
import type { VoiceState } from "@/lib/voice";

const PREFERENCE = "angklobot.wakeword.enabled";
type Phase = "off" | "starting" | "listening" | "detected" | "suspended" | "error";
type Options = { voiceState: VoiceState; onWake: () => Promise<void>; onFatal: () => void };

export function useWakeWord(options: Options) {
  const [enabled, setEnabled] = useState(false);
  const [remembered, setRemembered] = useState(false);
  const [phase, setPhase] = useState<Phase>("off");
  const [error, setError] = useState<string | null>(null);
  const [lastHeard, setLastHeard] = useState<string | null>(null);
  const active = useRef(false);
  const mounted = useRef(false);
  const epoch = useRef(0);
  const transition = useRef(0);
  const client = useRef<WhisperWakeListener | null>(null);
  const initializing = useRef<Promise<void> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const clearTimer = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  }, []);

  const fail = useCallback((caught: unknown) => {
    active.current = false;
    ++epoch.current;
    ++transition.current;
    clearTimer();
    client.current?.close();
    client.current = null;
    optionsRef.current.onFatal();
    if (mounted.current) {
      setEnabled(false);
      setPhase("error");
      setError(caught instanceof Error ? caught.message : "Wake-word mode failed.");
    }
  }, [clearTimer]);

  const suspend = useCallback(async () => {
    clearTimer();
    ++transition.current;
    // A manual Mic click during enable waits for the permission probe to release its tracks.
    await initializing.current;
    const connection = client.current;
    if (!connection) return;
    try {
      await connection.suspend();
      if (active.current && mounted.current) setPhase("suspended");
    } catch (caught) {
      fail(caught);
      throw caught; // Do not open the browser mic or speak without a confirmed handoff.
    }
  }, [clearTimer, fail]);

  const resume = useCallback(async () => {
    const connection = client.current;
    if (!active.current || !connection || optionsRef.current.voiceState !== "idle") return;
    const ticket = ++transition.current;
    try {
      await connection.arm();
      if (active.current && ticket === transition.current && mounted.current) setPhase("listening");
    } catch (caught) { if (active.current) fail(caught); }
  }, [fail]);

  const disable = useCallback(async () => {
    active.current = false;
    ++epoch.current;
    ++transition.current;
    clearTimer();
    const connection = client.current;
    client.current = null;
    optionsRef.current.onFatal(); // Cancels an outstanding wake-triggered capture/response too.
    setEnabled(false);
    setRemembered(false);
    setPhase("off");
    setError(null);
    try { window.localStorage.setItem(PREFERENCE, "false"); } catch { /* Private browsing. */ }
    try { await connection?.disable(); } catch { connection?.close(); }
  }, [clearTimer]);

  const enable = useCallback(async () => {
    if (active.current) return;
    if (optionsRef.current.voiceState !== "idle") {
      setError("Finish the current voice interaction before enabling wake-word mode.");
      return;
    }
    let finishInitialization: () => void = () => {};
    const initialization = new Promise<void>((resolve) => { finishInitialization = resolve; });
    initializing.current = initialization;
    active.current = true;
    const ticket = ++epoch.current;
    setEnabled(true);
    setPhase("starting");
    setError(null);
    setLastHeard(null);
    const connection = new WhisperWakeListener(() => {
      if (!active.current || ticket !== epoch.current || optionsRef.current.voiceState !== "idle") return;
      ++transition.current;
      setPhase("detected");
      clearTimer();
      // Detector already closed its stream. Leave a brief phrase/command boundary.
      timer.current = setTimeout(() => {
        if (active.current && ticket === epoch.current) void optionsRef.current.onWake().catch(fail);
      }, 250);
    }, (caught) => { if (active.current && ticket === epoch.current) fail(caught); },
    (text) => { if (active.current && ticket === epoch.current && mounted.current) setLastHeard(text); });
    client.current = connection;
    try {
      // Explicit user enable primes permission for later browser command capture.
      const permissionStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      permissionStream.getTracks().forEach((track) => track.stop());
      if (!active.current || ticket !== epoch.current) { connection.close(); return; }
      try { window.localStorage.setItem(PREFERENCE, "true"); } catch { /* Private browsing. */ }
      setRemembered(false);
      if (optionsRef.current.voiceState === "idle") await resume();
      else setPhase("suspended");
    } catch (caught) { if (active.current && ticket === epoch.current) fail(caught); }
    finally {
      finishInitialization();
      if (initializing.current === initialization) initializing.current = null;
    }
  }, [clearTimer, fail, resume]);

  useEffect(() => {
    mounted.current = true;
    let alive = true;
    try { setRemembered(window.localStorage.getItem(PREFERENCE) === "true"); } catch { /* Private browsing. */ }
    let permission: PermissionStatus | null = null;
    const revoked = () => { if (permission?.state === "denied" && active.current) fail(new Error("Microphone permission was revoked.")); };
    // Browsers without this Permissions API still fail on capture or track-ended errors.
    void navigator.permissions?.query({ name: "microphone" as PermissionName }).then((result) => {
      if (!alive) return;
      permission = result;
      result.addEventListener("change", revoked);
    }).catch(() => {});
    const leave = () => { active.current = false; client.current?.close(); };
    window.addEventListener("pagehide", leave);
    return () => {
      mounted.current = false;
      alive = false;
      active.current = false;
      ++epoch.current;
      clearTimer();
      client.current?.close();
      client.current = null;
      permission?.removeEventListener("change", revoked);
      window.removeEventListener("pagehide", leave);
    };
  }, [clearTimer, fail]);

  useEffect(() => {
    if (!active.current || phase === "starting" || phase === "detected") return;
    if (options.voiceState === "idle") {
      // No re-arm during queued TTS: voice hook sets speaking before scheduling speech.
      timer.current = setTimeout(() => void resume(), 500);
    } else {
      void suspend().catch(() => {});
    }
    return clearTimer;
  }, [options.voiceState, enabled, resume, suspend, clearTimer]); // Phase is owned by handoff, not a re-arm trigger.

  const status = !enabled ? (phase === "error" ? "Error" : "Wake word off") :
    options.voiceState === "listening" ? "Listening to command" :
    options.voiceState === "transcribing" ? "Transcribing" :
    options.voiceState === "thinking" ? "Thinking" :
    options.voiceState === "speaking" ? "Speaking" :
    phase === "starting" ? "Starting wake listening" :
    phase === "detected" ? "Wake word detected" :
    phase === "listening" ? "Listening for “Hey Angklobot”" : "Wake word paused";

  return { enabled, remembered, status, error, lastHeard, enable, disable, suspend, fail };
}

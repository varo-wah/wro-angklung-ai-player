"use client";
import { useEffect, useRef, useState } from "react";
import { useAngklungSystem } from "@/components/AngklungSystemProvider";
import { useVoiceAssistant } from "@/hooks/useVoiceAssistant";
import { VoiceSessionLease } from "@/lib/voiceSessionLease";

/** Shared orchestration; each route unmount releases its capture, TTS and tab lease. */
export function useVisitorAssistant() {
  const system = useAngklungSystem();
  const voice = useVoiceAssistant({
    onBeforeListen: () => { if (system.playbackState === "playing") system.pausePlayback(); },
    onAfterResponse: system.startPendingUserModePlayback,
    onWakeDetected: system.runWakeGreeting,
    onTranscript: system.requestSong,
  });
  const lease = useRef(new VoiceSessionLease());
  const alive = useRef(true);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [pendingActions, setPendingActions] = useState(0);
  const systemRef = useRef(system);
  systemRef.current = system;
  useEffect(() => {
    alive.current = true;
    const session = lease.current;
    return () => { alive.current = false; systemRef.current.cancelConversationRequest(); session.release(); };
  }, []);
  useEffect(() => {
    if (!pendingActions && !voice.wakeWord.enabled && (voice.state === "idle" || voice.state === "error")) lease.current.release();
  }, [voice.state, voice.wakeWord.enabled, pendingActions]);
  async function withSession(action: () => Promise<void>) {
    setPendingActions(count => count + 1);
    try {
      await lease.current.acquire();
      if (!alive.current) return;
      setSessionError(null);
      await action();
    } catch (error) {
      if (alive.current) setSessionError(error instanceof Error ? error.message : "Voice session unavailable.");
    } finally {
      if (alive.current) setPendingActions(count => count - 1);
    }
  }
  function clearChat() {
    voice.cancelListening();
    system.clearChat();
  }
  function runWithAudioPrepared(action: () => Promise<void>) {
    const audioReady = system.prepareUserModeAudio();
    return withSession(async () => { await audioReady; await action(); });
  }
  return {
    system, clearChat,
    voice: { ...voice, error: sessionError ?? voice.error,
      startListening: () => runWithAudioPrepared(voice.startListening),
      submitText: (text: string) => text.trim() ? runWithAudioPrepared(() => voice.submitText(text)) : Promise.resolve(),
      wakeWord: { ...voice.wakeWord, enable: () => runWithAudioPrepared(voice.wakeWord.enable) },
    },
  };
}
export type VisitorVoice = ReturnType<typeof useVisitorAssistant>["voice"];

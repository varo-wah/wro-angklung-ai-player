"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  BrowserVoiceRecorder,
  speakVoiceResponse,
  stopSpeaking,
  transcribeVoiceRecording,
  type VoiceLanguage,
  type VoiceState,
} from "@/lib/voice";

type VoiceAssistantOptions = {
  onBeforeListen: () => void;
  onTranscript: (transcript: string) => Promise<string | null>;
};

export function useVoiceAssistant({ onBeforeListen, onTranscript }: VoiceAssistantOptions) {
  const [error, setError] = useState<string | null>(null);
  const [language, setLanguageState] = useState<VoiceLanguage>("en");
  const [muted, setMutedState] = useState(false);
  const [state, setState] = useState<VoiceState>("idle");
  const [transcript, setTranscript] = useState("");
  const mountedRef = useRef(true);
  const recorderRef = useRef<BrowserVoiceRecorder | null>(null);
  const optionsRef = useRef({ onBeforeListen, onTranscript });

  optionsRef.current = { onBeforeListen, onTranscript };

  useEffect(() => {
    const storedLanguage = window.localStorage.getItem("angklobot.voice.language");
    const storedMuted = window.localStorage.getItem("angklobot.voice.muted");
    if (storedLanguage === "en" || storedLanguage === "id") {
      setLanguageState(storedLanguage);
    }
    setMutedState(storedMuted === "true");
    return () => {
      mountedRef.current = false;
      recorderRef.current?.cancel();
      stopSpeaking();
    };
  }, []);

  const stopSpeech = useCallback(() => {
    stopSpeaking();
    setState((current) => (current === "speaking" ? "idle" : current));
  }, []);

  const speak = useCallback(
    (text: string | null) => {
      if (!text || muted) {
        setState("idle");
        return;
      }
      const utterance = speakVoiceResponse(text, language, {
        onEnd: () => mountedRef.current && setState("idle"),
        onStart: () => mountedRef.current && setState("speaking"),
      });
      if (!utterance) {
        setError("Spoken responses are not supported by this browser.");
        setState("error");
      }
    },
    [language, muted],
  );

  const startListening = useCallback(async () => {
    if (state === "listening") {
      recorderRef.current?.stop();
      return;
    }
    if (state === "transcribing" || state === "thinking") {
      return;
    }

    stopSpeaking();
    optionsRef.current.onBeforeListen();
    setError(null);
    setTranscript("");
    setState("listening");
    const recorder = new BrowserVoiceRecorder();
    recorderRef.current = recorder;

    try {
      const recording = await recorder.recordUntilSilence();
      if (!mountedRef.current) return;
      recorderRef.current = null;
      setState("transcribing");
      const recognizedText = await transcribeVoiceRecording(recording, language);
      if (!mountedRef.current) return;
      setTranscript(recognizedText);
      setState("thinking");
      const response = await optionsRef.current.onTranscript(recognizedText);
      if (!mountedRef.current) return;
      speak(response);
    } catch (caughtError) {
      if (!mountedRef.current) return;
      const message = caughtError instanceof Error ? caughtError.message : "Voice input failed.";
      if (message === "Voice capture cancelled.") {
        setState("idle");
        return;
      }
      setError(message);
      setState("error");
    } finally {
      recorderRef.current = null;
    }
  }, [language, speak, state]);

  const cancelListening = useCallback(() => {
    recorderRef.current?.cancel();
    recorderRef.current = null;
    setState("idle");
  }, []);

  const setLanguage = useCallback((nextLanguage: VoiceLanguage) => {
    setLanguageState(nextLanguage);
    window.localStorage.setItem("angklobot.voice.language", nextLanguage);
  }, []);

  const setMuted = useCallback((nextMuted: boolean) => {
    setMutedState(nextMuted);
    window.localStorage.setItem("angklobot.voice.muted", String(nextMuted));
    if (nextMuted) {
      stopSpeaking();
      setState((current) => (current === "speaking" ? "idle" : current));
    }
  }, []);

  return {
    cancelListening,
    error,
    language,
    muted,
    setLanguage,
    setMuted,
    speak,
    startListening,
    state,
    stopSpeech,
    transcript,
  };
}

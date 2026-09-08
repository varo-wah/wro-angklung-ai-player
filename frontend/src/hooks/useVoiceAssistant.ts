"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  BrowserVoiceRecorder, VoiceCaptureError, speakVoiceResponse, stopSpeaking,
  transcribeVoiceRecording, type VoiceLanguage, type VoiceState,
} from "@/lib/voice";
import { useWakeWord } from "@/hooks/useWakeWord";

type VoiceAssistantOptions = {
  onAfterResponse?: () => Promise<unknown>;
  onBeforeListen: () => void;
  onWakeDetected?: () => Promise<void>;
  onTranscript: (transcript: string, language: VoiceLanguage) => Promise<string | null>;
};

export function useVoiceAssistant({ onAfterResponse, onBeforeListen, onWakeDetected, onTranscript }: VoiceAssistantOptions) {
  const [error, setError] = useState<string | null>(null);
  const [language, setLanguageState] = useState<VoiceLanguage>("en");
  const [muted, setMutedState] = useState(false);
  const mutedRef = useRef(muted);
  mutedRef.current = muted;
  const [state, setState] = useState<VoiceState>("idle");
  const [transcript, setTranscript] = useState("");
  const mountedRef = useRef(true);
  const recorderRef = useRef<BrowserVoiceRecorder | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const busyRef = useRef(false);
  const operationRef = useRef(0);
  const speechRef = useRef(0);
  const startRef = useRef<() => Promise<void>>(async () => {});
  const optionsRef = useRef({ onAfterResponse, onBeforeListen, onWakeDetected, onTranscript });
  optionsRef.current = { onAfterResponse, onBeforeListen, onWakeDetected, onTranscript };

  const stopSpeech = useCallback(() => {
    ++speechRef.current;
    stopSpeaking();
    utteranceRef.current = null;
    if (mountedRef.current) setState((current) => current === "speaking" ? "idle" : current);
  }, []);

  const cancelListening = useCallback(() => {
    ++operationRef.current;
    recorderRef.current?.cancel();
    recorderRef.current = null;
    abortRef.current?.abort();
    stopSpeech();
    // Keep a cancelled in-flight request busy until its promise actually settles.
    if (mountedRef.current) setState(busyRef.current ? "thinking" : "idle");
  }, [stopSpeech]);

  const wakeWord = useWakeWord({
    voiceState: state,
    onWake: async () => {
      await optionsRef.current.onWakeDetected?.();
      await startRef.current();
    },
    onFatal: cancelListening,
  });

  useEffect(() => {
    mountedRef.current = true;
    try {
      const storedLanguage = window.localStorage.getItem("angklobot.voice.language");
      if (storedLanguage === "en" || storedLanguage === "id") setLanguageState(storedLanguage);
      setMutedState(window.localStorage.getItem("angklobot.voice.muted") === "true");
    } catch { /* Private browsing may disable storage. */ }
    return () => {
      mountedRef.current = false;
      ++operationRef.current;
      ++speechRef.current;
      recorderRef.current?.cancel();
      abortRef.current?.abort();
      stopSpeaking();
      utteranceRef.current = null;
    };
  }, []);

  const speak = useCallback(async (text: string | null) => {
    const speech = ++speechRef.current;
    stopSpeaking();
    if (!text?.trim() || mutedRef.current) {
      await optionsRef.current.onAfterResponse?.();
      setState("idle");
      return;
    }
    // Mark busy before the browser queues an utterance; onstart can be delayed.
    setState("speaking");
    try {
      await wakeWord.suspend();
      if (!mountedRef.current || speech !== speechRef.current) return;
      const utterance = speakVoiceResponse(text, language, {
        onEnd: () => {
          if (mountedRef.current && speech === speechRef.current) {
            utteranceRef.current = null;
            void optionsRef.current.onAfterResponse?.().finally(() => {
              if (mountedRef.current && speech === speechRef.current) setState("idle");
            });
          }
        },
        onStart: () => {},
      });
      utteranceRef.current = utterance;
      if (!utterance) throw new Error("Spoken responses are not supported by this browser.");
    } catch (caught) {
      if (mountedRef.current && speech === speechRef.current) {
        await optionsRef.current.onAfterResponse?.();
        setError(caught instanceof Error ? caught.message : "Speech output failed.");
        setState("error");
        wakeWord.fail(caught);
      }
    }
  }, [language, wakeWord.suspend, wakeWord.fail]);

  const runRequest = useCallback(async (text?: string) => {
    if (busyRef.current) {
      if (text === undefined) recorderRef.current?.stop();
      return;
    }
    if (text !== undefined && !text.trim()) return;
    busyRef.current = true;
    const operation = ++operationRef.current;
    stopSpeech();
    setError(null);
    setTranscript("");
    const isCurrent = () => mountedRef.current && operation === operationRef.current;
    try {
      setState(text === undefined ? "listening" : "thinking");
      await wakeWord.suspend();
      if (!isCurrent()) return;
      let request = text;
      if (request === undefined) {
        optionsRef.current.onBeforeListen();
        const recorder = new BrowserVoiceRecorder();
        recorderRef.current = recorder;
        const recording = await recorder.recordUntilSilence();
        if (!isCurrent()) return;
        recorderRef.current = null;
        setState("transcribing");
        const controller = new AbortController();
        abortRef.current = controller;
        request = await transcribeVoiceRecording(recording, language, controller.signal);
        if (!isCurrent()) return;
        setTranscript(request);
      }
      setState("thinking");
      const response = await optionsRef.current.onTranscript(request, language);
      if (isCurrent()) await speak(response);
    } catch (caught) {
      if (!isCurrent()) return;
      if (caught instanceof VoiceCaptureError && caught.code === "cancelled") { setState("idle"); return; }
      setError(caught instanceof Error ? caught.message : "Voice input failed.");
      if (caught instanceof VoiceCaptureError && caught.code === "no_speech") {
        setState("idle"); // A missed command can return to wake listening.
      } else {
        setState("error");
        wakeWord.fail(caught);
      }
    } finally {
      recorderRef.current = null;
      abortRef.current = null;
      busyRef.current = false;
      if (mountedRef.current && operation !== operationRef.current) setState("idle");
    }
  }, [language, speak, stopSpeech, wakeWord.suspend, wakeWord.fail]);

  const startListening = useCallback(() => runRequest(), [runRequest]);
  startRef.current = startListening;

  const setLanguage = useCallback((nextLanguage: VoiceLanguage) => {
    setLanguageState(nextLanguage);
    try { window.localStorage.setItem("angklobot.voice.language", nextLanguage); } catch { /* Optional preference. */ }
  }, []);

  const setMuted = useCallback((nextMuted: boolean) => {
    mutedRef.current = nextMuted;
    setMutedState(nextMuted);
    try { window.localStorage.setItem("angklobot.voice.muted", String(nextMuted)); } catch { /* Optional preference. */ }
    if (nextMuted) stopSpeech();
  }, [stopSpeech]);

  return { cancelListening, error, language, muted, setLanguage, setMuted, speak,
    startListening, submitText: runRequest, state, stopSpeech, transcript, wakeWord };
}

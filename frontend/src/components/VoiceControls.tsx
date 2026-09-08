"use client";
import type { VisitorVoice } from "@/hooks/useVisitorAssistant";
import { VOICE_LANGUAGE_LABELS } from "@/lib/voice";

export function MicrophoneButton({ voice, large = false }: { voice: VisitorVoice; large?: boolean }) {
  return <button type="button" className={`voice-mic ${large ? "voice-mic-large" : ""}`} aria-label={voice.state === "listening" ? "Stop listening" : "Start voice input"}
    disabled={voice.state === "transcribing" || voice.state === "thinking"} onClick={() => void voice.startListening()}>
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      {voice.state === "listening" ? <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" /> : <><rect x="8" y="2" width="8" height="13" rx="4"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3m-4 0h8"/></>}
    </svg><span>{voice.state === "listening" ? "Stop" : "Mic"}</span>
  </button>;
}

export function VoiceControls({ voice }: { voice: VisitorVoice }) {
  return <div className="voice-controls">
    <button type="button" aria-pressed={voice.wakeWord.enabled} disabled={!voice.wakeWord.enabled && voice.state !== "idle" && voice.state !== "error"}
      className="voice-control wake-control" onClick={() => void (voice.wakeWord.enabled ? voice.wakeWord.disable() : voice.wakeWord.enable())}>
      <span className={`wake-dot ${voice.wakeWord.enabled ? "active" : ""}`} />Hey Angklobot: {voice.wakeWord.enabled ? "On" : "Off"}
    </button>
    <button type="button" className="voice-control" aria-pressed={voice.muted} onClick={() => voice.setMuted(!voice.muted)}>{voice.muted ? "Unmute" : "Mute"}</button>
    <label className="voice-control"><span className="sr-only">Voice language</span>
      <select aria-label="Voice language" value={voice.language} disabled={voice.state === "listening" || voice.state === "transcribing"}
        onChange={e => voice.setLanguage(e.target.value === "id" ? "id" : "en")}>
        {Object.entries(VOICE_LANGUAGE_LABELS).map(([value,label]) => <option key={value} value={value}>{label}</option>)}
      </select>
    </label>
    {voice.state === "speaking" && <button className="voice-control" type="button" onClick={voice.stopSpeech}>Stop speaking</button>}
    {voice.state === "listening" && <button className="voice-control" type="button" onClick={voice.cancelListening}>Cancel</button>}
  </div>;
}

export function voicePresentation(voice: VisitorVoice): { state: string; label: string } {
  if (voice.error || voice.wakeWord.error) return { state: "error", label: "Voice needs attention" };
  if (voice.state !== "idle") return { state: voice.state, label: {
    listening: "Listening…", transcribing: "Transcribing…", thinking: "Thinking…", speaking: "Speaking…", error: "Voice needs attention",
  }[voice.state] };
  if (voice.wakeWord.status === "Wake word detected") return { state: "detected", label: "I'm listening" };
  if (voice.wakeWord.enabled) return { state: "wake", label: voice.wakeWord.status === "Listening for “Hey Angklobot”" ? "Say ‘Hey Angklobot’" : voice.wakeWord.status };
  return { state: "idle", label: "Tap Mic to talk" };
}

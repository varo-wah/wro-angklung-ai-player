"use client";
import { MicrophoneButton, VoiceControls, voicePresentation } from "@/components/VoiceControls";
import { useVisitorAssistant } from "@/hooks/useVisitorAssistant";

export default function VoicePage() {
  const { system, voice } = useVisitorAssistant();
  const presentation = voicePresentation(voice);
  return <main className="voice-page" data-voice-state={presentation.state}>
    <div className="voice-heading"><p className="eyebrow">A conversation in harmony</p><h1>Angklobot Voice</h1></div>
    <section className="orb-stage" aria-label="Angklobot voice activity">
      <div className="angklobot-orb" aria-hidden="true"><div className="orb-halo"/><div className="orb-ring ring-one"/><div className="orb-ring ring-two"/>
        <div className="orb-core"><div className="orb-gloss"/><div className="orb-bars">{[0,1,2,3,4].map(i => <i key={i} style={{animationDelay:`${i * -0.17}s`}}/>)}</div></div>
      </div>
      <div className="orb-caption"><p role="status" aria-live="polite" className="orb-status">{presentation.label}</p>
        <p className="orb-hint">{voice.wakeWord.enabled ? "Say the wake phrase, pause, then ask." : "Enable Hey Angklobot for hands-free conversation."}</p></div>
    </section>
    <footer className="voice-footer"><MicrophoneButton voice={voice} large/><VoiceControls voice={voice}/>
      <button className="voice-control" type="button" aria-pressed={system.showSafetyNotices}
        title="Changes visitor-facing notices only; validation always remains active."
        onClick={() => system.setShowSafetyNotices(!system.showSafetyNotices)}>
        Safety notices: {system.showSafetyNotices ? "On" : "Off"}
      </button>
      {(voice.error || voice.wakeWord.error) && <p className="voice-error" role="alert">{voice.error || voice.wakeWord.error}</p>}
      <p className="voice-footnote">{voice.muted ? "Spoken replies are muted" : "English · Bahasa Indonesia"}</p>
    </footer>
  </main>;
}

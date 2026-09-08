"use client";

import { useEffect, useRef, useState } from "react";
import { LocalServicesStatus } from "@/components/LocalServicesStatus";
import { displaySongTitle } from "@/components/AngklungSystemProvider";
import { MicrophoneButton, VoiceControls, voicePresentation } from "@/components/VoiceControls";
import { useVisitorAssistant } from "@/hooks/useVisitorAssistant";

export default function GuestPage() {
  const { system, voice, clearChat } = useVisitorAssistant();
  const conversation = useRef<HTMLDivElement>(null);
  const [refreshing, setRefreshing] = useState(false);
  const presentation = voicePresentation(voice);
  useEffect(() => {
    const area = conversation.current;
    if (area) area.scrollTop = area.scrollHeight;
  }, [system.chatMessages, system.errors]);

  return <main className="guest-main">
    <section className="guest-panel" aria-label="Angklobot chat">
      <header className="chat-heading">
        <div><p className="eyebrow">User Mode</p><h1>Talk with Angklobot</h1></div>
        <div className="flex items-center gap-1">
          <button className="quiet-button" type="button" aria-pressed={system.showSafetyNotices}
            title="Changes visitor-facing notices only; validation always remains active."
            onClick={() => system.setShowSafetyNotices(!system.showSafetyNotices)}>
            Notices: {system.showSafetyNotices ? "On" : "Off"}
          </button>
          <button className="quiet-button" type="button" onClick={clearChat}>Clear Chat</button>
          <button className="quiet-button refresh-ai" type="button" disabled={refreshing || !system.supportedSongs.length}
            onClick={async () => { voice.cancelListening(); setRefreshing(true); try { await system.refreshAiAssistant(); } finally { setRefreshing(false); } }}>
            {refreshing ? "Refreshing…" : "Refresh AI"}
          </button>
        </div>
      </header>
      <div ref={conversation} className="conversation-history" role="log" aria-label="Conversation" aria-live="polite">
        <div className="conversation-intro">
          <p className="text-sm text-slate-400">Ask about angklung, or choose a song from the library.</p>
          <details className="mt-3"><summary className="cursor-pointer text-sm text-lime-200">Browse available songs</summary>
            <div className="mt-3 flex flex-wrap gap-2">{system.supportedSongs.map(song => <button className="song-chip" key={song.id} type="button"
              onClick={() => void voice.submitText(song.title)}>{displaySongTitle(song.title)}</button>)}</div>
          </details>
        </div>
        {system.chatMessages.length === 0 && <p className="empty-chat">A fresh conversation. What would you like to ask?</p>}
        {system.chatMessages.map(message => <article key={message.id} className={`chat-message ${message.speaker}`}>
          <span className="chat-speaker">{message.speaker === "assistant" ? "Angklobot" : "You"}</span><p>{message.text}</p>
        </article>)}
        {system.errors.length > 0 && <p className="voice-error" role="alert">{system.errors.join(" ")}</p>}
      </div>
      <footer className="chat-composer">
        <form className="chat-input-row" onSubmit={event => { event.preventDefault(); void voice.submitText(system.chatInput); }}>
          <input aria-label="Message Angklobot" placeholder="Message Angklobot…" value={system.chatInput} onChange={event => system.setChatInput(event.target.value)} />
          <MicrophoneButton voice={voice}/><button type="submit" className="send-button" aria-label="Send message">↑</button>
        </form>
        <VoiceControls voice={voice}/>
        <p className="voice-status" role="status" aria-live="polite">{presentation.label}</p>
        {(voice.error || voice.wakeWord.error) && <p className="voice-error" role="alert">{voice.error || voice.wakeWord.error}</p>}
      </footer>
      {process.env.NODE_ENV === "development" && <LocalServicesStatus />}
    </section>
  </main>;
}

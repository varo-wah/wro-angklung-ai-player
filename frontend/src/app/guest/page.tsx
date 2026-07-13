"use client";

import { useState, type ReactNode } from "react";
import { displaySongTitle, useAngklungSystem } from "@/components/AngklungSystemProvider";

export default function GuestPage() {
  const system = useAngklungSystem();
  const ready = Boolean(system.schedule && system.workflowStatus.readyForSimulation);
  const showPlaybackActions = Boolean(system.schedule);
  const pendingSongTitle = system.aiPendingSongId ? system.supportedSongs.find((song) => song.id === system.aiPendingSongId)?.title ?? null : null;
  const [isRefreshingAi, setIsRefreshingAi] = useState(false);

  async function refreshAi(): Promise<void> {
    setIsRefreshingAi(true);
    try {
      await system.refreshAiAssistant();
    } finally {
      setIsRefreshingAi(false);
    }
  }

  return (
    <main className="min-h-[calc(100vh-88px)] px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-140px)] max-w-4xl flex-col">
        <section className="flex flex-1 flex-col overflow-hidden rounded-[28px] border border-white/10 bg-slate-950/72 shadow-[0_30px_100px_rgba(0,0,0,0.55)] backdrop-blur-xl">
          <div className="border-b border-white/10 px-5 py-5 sm:px-7">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-lime-300">Guest Interface</p>
                <h2 className="mt-2 text-2xl font-semibold text-slate-50 sm:text-3xl">AI Angklung Song Assistant</h2>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  className="rounded-full border border-white/15 bg-white/[0.06] px-4 py-2 text-sm font-semibold text-slate-200 hover:border-lime-300/60 hover:text-lime-100 disabled:cursor-wait disabled:opacity-60"
                  disabled={isRefreshingAi || system.supportedSongs.length === 0}
                  onClick={() => void refreshAi()}
                  title="Clear the saved conversation and recheck the live AI provider"
                  type="button"
                >
                  {isRefreshingAi ? "Refreshing AI..." : "Refresh AI"}
                </button>
                <AiModeBadge mode={system.aiAssistantMode} />
                <AiStateBadge state={system.aiConversationState} />
                <StatusPill ready={ready} playbackState={system.playbackState} sourceMode={system.sourceMode} />
              </div>
            </div>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-300">
              Talk with Angklobot or ask for music by song, artist, mood, or genre. Playback always uses a validated library arrangement.
            </p>
          </div>

          <div className="flex-1 overflow-auto px-4 py-6 sm:px-7">
            <div className="space-y-6">
              {system.chatMessages.map((message) => (
                <ChatBubble key={message.id} speaker={message.speaker} text={message.text} />
              ))}
              {system.sourceMode === "youtube_placeholder" && (
                <SystemNotice>
                  This song is not currently supported. Future YouTube Piano Reference Mode will search for a simple piano version, ask for
                  approval, and only continue if the melody fits the G3-C6 angklung rack.
                </SystemNotice>
              )}
              {system.errors.length > 0 && (
                <SystemNotice tone="error">
                  I could not complete that action. Please try another request or ask the operator for help.
                </SystemNotice>
              )}
            </div>
          </div>

          <div className="border-t border-white/10 bg-black/24 px-4 py-4 sm:px-7">
            <div className="mb-4 flex flex-wrap gap-2">
              {system.supportedSongs.map((song) => (
                <button
                  className="rounded-full border border-white/10 bg-white/[0.06] px-4 py-2 text-sm font-medium text-slate-200 hover:border-lime-300/60 hover:bg-lime-300/10 hover:text-lime-100"
                  key={song.id}
                  onClick={() => system.requestSong(song.title)}
                  type="button"
                >
                  {displaySongTitle(song.title)}
                </button>
              ))}
            </div>

            <form
              className="flex items-center gap-2 rounded-full border border-white/10 bg-slate-900/95 p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] focus-within:border-lime-300/60"
              onSubmit={(event) => {
                event.preventDefault();
                system.requestSong(system.chatInput);
              }}
            >
              <input
                className="min-w-0 flex-1 bg-transparent px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500"
                onChange={(event) => system.setChatInput(event.target.value)}
                placeholder="Message the angklung assistant..."
                value={system.chatInput}
              />
              <button
                className="grid h-11 w-11 place-items-center rounded-full border border-white/10 bg-white/5 text-sm font-semibold text-slate-500"
                disabled
                title="Voice input coming later"
                type="button"
              >
                Mic
              </button>
              <button className="grid h-11 w-11 place-items-center rounded-full bg-lime-300 text-sm font-bold text-slate-950 hover:bg-lime-200" type="submit">
                Send
              </button>
            </form>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm">
              <div>
                <div className="font-semibold text-slate-100">{system.schedule?.song.title ?? system.sourceLabel}</div>
                <div className="mt-0.5 text-xs text-slate-400">
                  {system.aiConversationState === "awaiting_confirmation"
                    ? `Waiting for confirmation: ${displaySongTitle(pendingSongTitle ?? "selected song")}. Reply yes or no.`
                    : ready
                      ? "Validation passed. Ready to play."
                      : getVisitorStatus(system.sourceMode, system.workflowStatus.validationPassed)}
                </div>
              </div>
              <div className="flex gap-2">
                {showPlaybackActions && (
                  <button
                    className="rounded-full bg-emerald-400 px-5 py-2 font-semibold text-slate-950 hover:bg-emerald-300 disabled:bg-slate-800 disabled:text-slate-500"
                    disabled={!ready || system.playbackState === "playing"}
                    onClick={system.playSchedule}
                    type="button"
                  >
                    Play
                  </button>
                )}
                {showPlaybackActions && (
                  <button
                    className="rounded-full border border-white/15 bg-white/5 px-5 py-2 font-semibold text-slate-200 hover:border-white/30 disabled:text-slate-600"
                    disabled={!system.schedule}
                    onClick={system.stopPlayback}
                    type="button"
                  >
                    Stop
                  </button>
                )}
              </div>
            </div>

            <p className="mt-3 text-center text-xs text-slate-500">Voice input and spoken response are coming later.</p>
          </div>
        </section>
      </div>
    </main>
  );
}

function ChatBubble({ speaker, text }: { speaker: "assistant" | "user"; text: string }) {
  const isAssistant = speaker === "assistant";

  return (
    <div className={`flex gap-3 ${isAssistant ? "justify-start" : "justify-end"}`}>
      {isAssistant && <Avatar label="A" />}
      <div className={`max-w-[78%] ${isAssistant ? "" : "order-first"}`}>
        <div className={`mb-1 text-xs font-semibold ${isAssistant ? "text-slate-400" : "text-right text-lime-200"}`}>
          {isAssistant ? "Assistant" : "You"}
        </div>
        <div
          className={`rounded-[22px] px-5 py-3 text-sm leading-relaxed shadow-[0_14px_35px_rgba(0,0,0,0.22)] ${
            isAssistant
              ? "rounded-tl-md border border-white/10 bg-white/[0.07] text-slate-100"
              : "rounded-tr-md bg-lime-300 text-slate-950"
          }`}
        >
          {text}
        </div>
      </div>
      {!isAssistant && <Avatar label="U" />}
    </div>
  );
}

function Avatar({ label }: { label: string }) {
  return (
    <div className="mt-5 grid h-8 w-8 shrink-0 place-items-center rounded-full border border-white/10 bg-white/[0.08] text-xs font-bold text-slate-200">
      {label}
    </div>
  );
}

function SystemNotice({ children, tone = "info" }: { children: ReactNode; tone?: "info" | "error" }) {
  const classes =
    tone === "error"
      ? "border-red-300/30 bg-red-400/10 text-red-100"
      : "border-lime-300/30 bg-lime-300/10 text-lime-100";

  return (
    <div className={`mx-auto max-w-2xl rounded-3xl border px-5 py-4 text-sm leading-relaxed ${classes}`}>
      {children}
    </div>
  );
}

function StatusPill({
  playbackState,
  ready,
  sourceMode,
}: {
  playbackState: string;
  ready: boolean;
  sourceMode: string;
}) {
  const label = playbackState === "playing" ? "Playing" : ready ? "Ready" : sourceMode === "youtube_placeholder" ? "Unsupported" : "Waiting";
  const color =
    playbackState === "playing"
      ? "border-emerald-300/40 bg-emerald-300/10 text-emerald-100"
      : ready
        ? "border-lime-300/40 bg-lime-300/10 text-lime-100"
        : sourceMode === "youtube_placeholder"
          ? "border-red-300/40 bg-red-300/10 text-red-100"
          : "border-white/10 bg-white/[0.06] text-slate-300";

  return <span className={`rounded-full border px-4 py-2 text-sm font-semibold ${color}`}>{label}</span>;
}

function AiModeBadge({ mode }: { mode: "local_ollama" | "openai_optional" | "local_fallback" }) {
  const labels = {
    local_fallback: "Local fallback",
    local_ollama: "Local Ollama",
    openai_optional: "OpenAI",
  };
  const isFullAi = mode === "local_ollama" || mode === "openai_optional";
  return (
    <span
      className={`rounded-full border px-4 py-2 text-sm font-semibold ${
        isFullAi ? "border-emerald-300/40 bg-emerald-300/10 text-emerald-100" : "border-white/10 bg-white/[0.06] text-slate-300"
      }`}
    >
      AI mode: {labels[mode]}
    </span>
  );
}

function AiStateBadge({ state }: { state: "idle" | "awaiting_song" | "awaiting_confirmation" | "ready_to_play" | "unsupported" }) {
  const labels = {
    awaiting_confirmation: "Awaiting confirmation",
    awaiting_song: "Awaiting song",
    idle: "Idle",
    ready_to_play: "Ready",
    unsupported: "Unsupported",
  };

  return (
    <span className="rounded-full border border-white/10 bg-white/[0.06] px-4 py-2 text-sm font-semibold text-slate-300">
      State: {labels[state]}
    </span>
  );
}

function getVisitorStatus(sourceMode: string, validationPassed: boolean): string {
  if (sourceMode === "youtube_placeholder") {
    return "Unsupported for now. Please choose a supported song.";
  }
  if (validationPassed) {
    return "Validation passed. Ready to play.";
  }
  return "Choose or request a supported song to begin.";
}

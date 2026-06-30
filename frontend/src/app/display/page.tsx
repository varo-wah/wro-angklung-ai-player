"use client";

import { useMemo } from "react";
import { displaySongTitle, useAngklungSystem, type SourceMode, type SystemStatus } from "@/components/AngklungSystemProvider";
import type { BuiltInSongNote } from "@/lib/builtInSongs";
import type { PlaybackState } from "@/lib/types";

export default function DisplayPage() {
  const system = useAngklungSystem();
  const latestAssistantMessage = useMemo(
    () => [...system.chatMessages].reverse().find((message) => message.speaker === "assistant")?.text ?? "Hi, what song would you like to hear?",
    [system.chatMessages],
  );
  const status = getDisplayStatus(system.systemStatus, system.playbackState);
  const selectedSongTitle = system.sourceMode === "youtube_placeholder" ? "No supported match yet" : displaySongTitle(system.selectedSong.title);
  const currentMessage =
    system.playbackState === "playing" && system.schedule
      ? `Now playing: ${displaySongTitle(system.schedule.song.title)}.`
      : latestAssistantMessage;

  return (
    <main className="min-h-screen overflow-hidden px-5 py-6 lg:px-10">
      <div className="mx-auto flex min-h-[calc(100vh-140px)] max-w-7xl flex-col gap-6">
        <section className="relative overflow-hidden rounded-[32px] border border-lime-300/20 bg-black/35 p-6 shadow-[0_32px_120px_rgba(0,0,0,0.55)] backdrop-blur-xl lg:p-8">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_12%,rgba(132,204,22,0.18),transparent_34%),radial-gradient(circle_at_82%_72%,rgba(16,185,129,0.12),transparent_30%)]" />
          <div className="relative flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.24em] text-lime-300">AI Angklung Performance System</p>
              <h2 className="mt-3 max-w-3xl text-4xl font-semibold text-slate-50 sm:text-5xl lg:text-6xl">Live performance display</h2>
            </div>
            <StatusPill label={status.label} tone={status.tone} />
          </div>

          <div className="relative mt-8 grid items-center gap-8 lg:grid-cols-[minmax(0,0.95fr)_minmax(360px,0.65fr)]">
            <div className="flex flex-col items-center text-center">
              <VoiceOrb playbackState={system.playbackState} sourceMode={system.sourceMode} systemStatus={system.systemStatus} />
              <div className="mt-7 max-w-4xl rounded-[28px] border border-white/10 bg-slate-950/72 px-6 py-5 shadow-[0_24px_80px_rgba(0,0,0,0.35)]">
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">Assistant</p>
                <p className="mt-3 text-2xl font-medium leading-snug text-slate-50 sm:text-3xl">{currentMessage}</p>
              </div>
            </div>

            <div className="grid gap-3">
              <DisplayMetric label="Latest request" value={system.latestUserRequest || "Waiting for a guest"} />
              <DisplayMetric label="Matched song" value={selectedSongTitle} />
              <DisplayMetric label="Source mode" value={formatSourceMode(system.sourceMode)} />
              <DisplayMetric label="Playback" value={formatPlaybackState(system.playbackState)} />
              <DisplayMetric label="Validation" value={system.safetyReport?.overall ?? "Not run"} />
              <DisplayMetric label="Active actuators" value={String(system.activeInstrumentIds.size)} />
            </div>
          </div>
        </section>

        <section className="grid flex-1 gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
          <MusicSheetPreview
            elapsedSeconds={system.elapsedSeconds}
            notes={system.generatedNotes}
            playbackState={system.playbackState}
            totalDuration={system.totalDuration}
          />

          <div className="flex flex-col gap-6">
            <NowPlayingPanel
              elapsedSeconds={system.elapsedSeconds}
              latestUserRequest={system.latestUserRequest}
              playbackState={system.playbackState}
              scheduleTitle={system.schedule?.song.title}
              sourceMode={system.sourceMode}
              totalDuration={system.totalDuration}
            />
            {system.sourceMode === "youtube_placeholder" && <YoutubePlaceholder />}
          </div>
        </section>
      </div>
    </main>
  );
}

function VoiceOrb({
  playbackState,
  sourceMode,
  systemStatus,
}: {
  playbackState: PlaybackState;
  sourceMode: SourceMode;
  systemStatus: SystemStatus;
}) {
  const unsupported = sourceMode === "youtube_placeholder" || systemStatus === "unsupported";
  const playing = playbackState === "playing";
  const orbTone = unsupported
    ? "from-red-300/80 via-rose-500/60 to-slate-950"
    : playing
      ? "from-lime-200 via-emerald-400 to-teal-700"
      : "from-lime-200/80 via-lime-400/70 to-emerald-900";
  const ringTone = unsupported ? "border-red-300/25" : playing ? "border-emerald-300/40" : "border-lime-300/25";

  return (
    <div className="relative grid h-72 w-72 place-items-center sm:h-80 sm:w-80">
      <div className={`absolute inset-0 rounded-full border ${ringTone} animate-ping opacity-20`} />
      <div className={`absolute inset-8 rounded-full border ${ringTone} animate-pulse`} />
      <div className={`absolute inset-16 rounded-full bg-gradient-to-br ${orbTone} blur-md opacity-80`} />
      <div className="relative grid h-44 w-44 place-items-center rounded-full border border-white/20 bg-black/50 shadow-[0_0_80px_rgba(132,204,22,0.35)]">
        <div className="flex h-24 items-center gap-2">
          {Array.from({ length: 9 }).map((_, index) => (
            <span
              className={`w-2 rounded-full ${unsupported ? "bg-red-200/80" : "bg-lime-200"} ${playing ? "animate-pulse" : ""}`}
              key={index}
              style={{ height: `${28 + ((index * 17) % 58)}px`, animationDelay: `${index * 90}ms` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function StatusPill({ label, tone }: { label: string; tone: "ready" | "thinking" | "playing" | "unsupported" | "idle" }) {
  const colors = {
    idle: "border-white/10 bg-white/8 text-slate-200",
    playing: "border-emerald-300/40 bg-emerald-300/15 text-emerald-100",
    ready: "border-lime-300/40 bg-lime-300/15 text-lime-100",
    thinking: "border-cyan-300/40 bg-cyan-300/15 text-cyan-100",
    unsupported: "border-red-300/40 bg-red-300/15 text-red-100",
  };

  return <span className={`rounded-full border px-5 py-3 text-lg font-semibold ${colors[tone]}`}>{label}</span>;
}

function DisplayMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/60 px-5 py-4">
      <div className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">{label}</div>
      <div className="mt-2 truncate text-xl font-semibold text-slate-50">{value}</div>
    </div>
  );
}

function NowPlayingPanel({
  elapsedSeconds,
  latestUserRequest,
  playbackState,
  scheduleTitle,
  sourceMode,
  totalDuration,
}: {
  elapsedSeconds: number;
  latestUserRequest: string;
  playbackState: PlaybackState;
  scheduleTitle?: string;
  sourceMode: SourceMode;
  totalDuration: number;
}) {
  const progress = totalDuration > 0 ? Math.min((elapsedSeconds / totalDuration) * 100, 100) : 0;
  const title = scheduleTitle ? displaySongTitle(scheduleTitle) : sourceMode === "youtube_placeholder" ? "Unsupported request" : "Waiting for song";

  return (
    <section className="rounded-[28px] border border-white/10 bg-slate-950/72 p-5 shadow-[0_24px_80px_rgba(0,0,0,0.35)]">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-lime-300">Now playing</p>
      <h3 className="mt-3 text-3xl font-semibold text-slate-50">{title}</h3>
      <p className="mt-2 text-sm text-slate-400">{latestUserRequest ? `Requested: ${latestUserRequest}` : "Waiting for a guest request."}</p>
      <div className="mt-5 h-3 overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full bg-lime-300 transition-[width]" style={{ width: `${progress}%` }} />
      </div>
      <div className="mt-3 flex justify-between text-sm font-medium text-slate-400">
        <span>{formatPlaybackState(playbackState)}</span>
        <span>
          {elapsedSeconds.toFixed(1)}s / {totalDuration.toFixed(1)}s
        </span>
      </div>
    </section>
  );
}

function MusicSheetPreview({
  elapsedSeconds,
  notes,
  playbackState,
  totalDuration,
}: {
  elapsedSeconds: number;
  notes: BuiltInSongNote[];
  playbackState: PlaybackState;
  totalDuration: number;
}) {
  const previewNotes = notes.slice(0, 28);
  const playhead = totalDuration > 0 ? Math.min((elapsedSeconds / totalDuration) * 100, 100) : 0;

  return (
    <section className="relative min-h-[360px] overflow-hidden rounded-[28px] border border-white/10 bg-slate-950/72 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.35)]">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-lime-300">Music Sheet Preview</p>
          <h3 className="mt-2 text-3xl font-semibold text-slate-50">Angklung melody map</h3>
        </div>
        <span className="rounded-full border border-white/10 bg-white/8 px-4 py-2 text-sm font-semibold text-slate-300">
          {notes.length} notes
        </span>
      </div>

      <div className="relative h-64 rounded-3xl border border-white/10 bg-black/35 px-5 py-8">
        {[0, 1, 2, 3, 4].map((line) => (
          <div className="absolute left-5 right-5 h-px bg-lime-100/20" key={line} style={{ top: `${24 + line * 34}px` }} />
        ))}

        {notes.length === 0 && (
          <div className="grid h-full place-items-center text-center text-lg font-medium text-slate-400">
            Music sheet preview will appear after a supported song is selected.
          </div>
        )}

        {previewNotes.map((note, index) => {
          const left = totalDuration > 0 ? Math.min((note.start / totalDuration) * 92 + 2, 94) : (index / Math.max(previewNotes.length - 1, 1)) * 90 + 3;
          const top = getNoteTop(note.note);
          const active = playbackState === "playing" && elapsedSeconds >= note.start && elapsedSeconds <= note.start + note.duration;

          return (
            <div
              className={`absolute -translate-x-1/2 rounded-full border px-3 py-1 text-sm font-bold shadow-[0_12px_30px_rgba(0,0,0,0.3)] ${
                active
                  ? "border-lime-200 bg-lime-300 text-slate-950"
                  : "border-lime-300/30 bg-lime-300/15 text-lime-100"
              }`}
              key={`${note.start}-${note.note}-${index}`}
              style={{ left: `${left}%`, top: `${top}px` }}
            >
              {note.note}
            </div>
          );
        })}

        {notes.length > 0 && (
          <div
            className="absolute bottom-6 top-6 w-0.5 rounded-full bg-emerald-300 shadow-[0_0_24px_rgba(110,231,183,0.8)] transition-[left]"
            style={{ left: `${Math.max(5, Math.min(playhead, 95))}%` }}
          />
        )}
      </div>
    </section>
  );
}

function YoutubePlaceholder() {
  return (
    <section className="rounded-[28px] border border-red-300/25 bg-red-300/10 p-5 shadow-[0_24px_80px_rgba(0,0,0,0.35)]">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-red-200">Candidate YouTube Reference</p>
      <h3 className="mt-3 text-2xl font-semibold text-slate-50">Simple piano version placeholder</h3>
      <p className="mt-3 text-sm leading-relaxed text-red-50/90">
        This song is not currently supported. Future YouTube Piano Reference Mode will search for a simple piano version, ask for approval,
        and only continue if the melody fits the 2.5-octave angklung rack.
      </p>
      <div className="mt-4 rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm font-semibold text-slate-200">
        Approval required before conversion - Coming in Phase 3
      </div>
    </section>
  );
}

function getDisplayStatus(systemStatus: SystemStatus, playbackState: PlaybackState): { label: string; tone: "ready" | "thinking" | "playing" | "unsupported" | "idle" } {
  if (playbackState === "playing" || systemStatus === "playing") {
    return { label: "Playing", tone: "playing" };
  }
  if (systemStatus === "unsupported") {
    return { label: "Unsupported", tone: "unsupported" };
  }
  if (systemStatus === "request_received" || systemStatus === "schedule_generated") {
    return { label: "Thinking", tone: "thinking" };
  }
  if (systemStatus === "validated") {
    return { label: "Ready", tone: "ready" };
  }
  return { label: "Listening", tone: "idle" };
}

function formatSourceMode(sourceMode: SourceMode): string {
  const labels: Record<SourceMode, string> = {
    library: "Supported Library",
    manual_upload: "Manual Upload",
    youtube_placeholder: "YouTube Reference Placeholder",
  };
  return labels[sourceMode];
}

function formatPlaybackState(playbackState: PlaybackState): string {
  const labels: Record<PlaybackState, string> = {
    idle: "Idle",
    paused: "Paused",
    playing: "Playing",
    stopped: "Stopped",
  };
  return labels[playbackState];
}

function getNoteTop(note: string): number {
  const order = ["G4", "A4", "B4", "C5", "D5", "E5", "F5", "G5", "A5", "B5", "C6", "D6", "E6", "F6", "G6", "C7"];
  const index = Math.max(order.indexOf(note), 0);
  return 184 - (index % 9) * 18;
}

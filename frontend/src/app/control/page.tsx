"use client";

import Link from "next/link";
import { useState } from "react";

import {
  useAngklungSystem,
  type SourceMode,
  type SystemStatus,
  type WorkflowStatus,
} from "@/components/AngklungSystemProvider";
import { FloatingAngklungRack } from "@/components/FloatingAngklungRack";
import { PlaybackControls } from "@/components/PlaybackControls";
import { ScheduleJsonViewer } from "@/components/ScheduleJsonViewer";
import { ScheduleUploader } from "@/components/ScheduleUploader";
import { SongLibraryPicker } from "@/components/SongLibraryPicker";
import { TimelineView } from "@/components/TimelineView";
import type { AiAssistantMode, AiConversationState, AiPreRouterDecision, AiSongRequestIntent } from "@/lib/aiSongRequest";
import type { ArrangementSettings } from "@/lib/scheduleBuilder";
import type { SafetyReport } from "@/lib/safetyValidator";
import type { LoadedSong, SongNote } from "@/lib/songTypes";
import type { PlaybackState } from "@/lib/types";

export default function ControlPage() {
  const system = useAngklungSystem();

  return (
    <main className="min-h-screen px-4 py-4 pb-24 lg:px-6">
      <div className="mx-auto flex max-w-[1600px] flex-col gap-4">
        <section className="grid gap-4 border-b border-white/10 pb-4 lg:grid-cols-[minmax(0,1fr)_minmax(520px,0.9fr)] lg:items-end">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between lg:block">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-lime-300">Control Panel</p>
              <h2 className="mt-1 text-2xl font-bold text-slate-50">Operator Workspace</h2>
              <p className="mt-1 text-sm text-slate-400">Configure, validate, and run the angklung simulator from one desktop console.</p>
            </div>
            <Link
              className="mt-3 inline-flex w-fit rounded-md border border-lime-300/30 bg-lime-300/10 px-3 py-2 text-xs font-bold text-lime-100 hover:border-lime-300/50 hover:bg-lime-300/15 lg:mt-3"
              href="/control/library-builder"
            >
              Open Library Builder
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm text-slate-300 sm:grid-cols-4">
            <Metric label="Source" value={system.sourceLabel} />
            <Metric label="Duration" value={`${system.totalDuration.toFixed(2)}s`} />
            <Metric label="Commands" value={String(system.schedule?.commands.length ?? 0)} />
            <Metric label="Playback" value={system.playbackState} />
          </div>
        </section>

        <GuestRequestMonitor
          aiAssistantMode={system.aiAssistantMode}
          aiConfidence={system.aiConfidence}
          aiConversationState={system.aiConversationState}
          aiFallbackReason={system.aiFallbackReason}
          aiIntent={system.aiIntent}
          aiKnowledgeSections={system.aiKnowledgeSections}
          aiLastUnsupportedRequest={system.aiLastUnsupportedRequest}
          aiMatchedSongId={system.aiMatchedSongId}
          aiNeedsOperatorReview={system.aiNeedsOperatorReview}
          aiPendingSongId={system.aiPendingSongId}
          aiPreRouterDecision={system.aiPreRouterDecision}
          aiRawProviderResult={system.aiRawProviderResult}
          aiShouldSearchCatalog={system.aiShouldSearchCatalog}
          aiSuggestedSongIds={system.aiSuggestedSongIds}
          latestUserRequest={system.latestUserRequest}
          playbackState={system.playbackState}
          safetyReport={system.safetyReport}
          selectedSongTitle={system.sourceMode === "youtube_placeholder" ? "" : system.selectedSong.title}
          sourceMode={system.sourceMode}
          systemStatus={system.systemStatus}
        />

        <section className="grid items-start gap-4 xl:grid-cols-[440px_minmax(0,1fr)]">
          <div className="flex min-w-0 flex-col gap-4">
            <SongSourcePanel />
            <ArrangementSettingsPanel />
            <CandidateYoutubePanel active={system.youtubeFallbackActive} />
            <AdvancedUploadPanel />
          </div>

          <div className="flex min-w-0 flex-col gap-4">
            <AnalysisWorkspace />
            <ArrangementStatusPanel report={system.safetyReport} song={system.selectedSong} />
          </div>
        </section>
      </div>
      <FloatingAngklungRack activeInstrumentIds={system.activeInstrumentIds} instruments={system.instruments} />
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-white/10 bg-black/25 px-3 py-2">
      <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">{label}</div>
      <div className="mt-1 truncate text-sm font-semibold text-slate-100">{value}</div>
    </div>
  );
}

type AnalysisTab = "overview" | "notes" | "timeline" | "json";

function AnalysisWorkspace() {
  const system = useAngklungSystem();
  const [activeTab, setActiveTab] = useState<AnalysisTab>("overview");
  const tabs: Array<[AnalysisTab, string, string]> = [
    ["overview", "Overview", system.safetyReport?.overall ?? "Not run"],
    ["notes", "Notes", String(system.generatedNotes.length)],
    ["timeline", "Timeline", String(system.schedule?.commands.length ?? 0)],
    ["json", "JSON", system.schedule ? "Ready" : "Empty"],
  ];

  return (
    <section aria-label="Analysis workspace">
      <div className="mb-4 flex min-w-0 gap-1 overflow-x-auto rounded-lg border border-white/10 bg-black/25 p-1">
        {tabs.map(([tabId, label, detail]) => (
          <button
            aria-pressed={activeTab === tabId}
            className={`min-w-[110px] flex-1 rounded px-3 py-2 text-left transition-all duration-200 ${
              activeTab === tabId ? "bg-lime-300 text-slate-950 shadow-[0_0_24px_rgba(190,242,100,0.16)]" : "text-slate-300 hover:bg-white/[0.06] hover:text-white"
            }`}
            key={tabId}
            onClick={() => setActiveTab(tabId)}
            type="button"
          >
            <span className="block text-sm font-bold">{label}</span>
            <span className={`block truncate text-[10px] ${activeTab === tabId ? "text-slate-800" : "text-slate-500"}`}>{detail}</span>
          </button>
        ))}
      </div>

      <div className="animate-panel-in" key={activeTab}>
        {activeTab === "overview" ? (
          <div className="grid gap-4 2xl:grid-cols-2">
            <WorkflowStatusPanel status={system.workflowStatus} />
            <ValidationPanel errors={system.errors} report={system.safetyReport} />
          </div>
        ) : null}
        {activeTab === "notes" ? <NotesPreview notes={system.generatedNotes} /> : null}
        {activeTab === "timeline" ? <TimelineView activeCommandIds={system.activeCommandIds} commands={system.schedule?.commands ?? []} /> : null}
        {activeTab === "json" ? <ScheduleJsonViewer schedule={system.schedule} /> : null}
      </div>
    </section>
  );
}

function GuestRequestMonitor({
  aiAssistantMode,
  aiConfidence,
  aiConversationState,
  aiFallbackReason,
  aiIntent,
  aiKnowledgeSections,
  aiLastUnsupportedRequest,
  aiMatchedSongId,
  aiNeedsOperatorReview,
  aiPendingSongId,
  aiPreRouterDecision,
  aiRawProviderResult,
  aiShouldSearchCatalog,
  aiSuggestedSongIds,
  latestUserRequest,
  playbackState,
  safetyReport,
  selectedSongTitle,
  sourceMode,
  systemStatus,
}: {
  aiAssistantMode: AiAssistantMode;
  aiConfidence: number;
  aiConversationState: AiConversationState;
  aiFallbackReason: string | null;
  aiIntent: AiSongRequestIntent;
  aiKnowledgeSections: string[];
  aiLastUnsupportedRequest: string | null;
  aiMatchedSongId: string | null;
  aiNeedsOperatorReview: boolean;
  aiPendingSongId: string | null;
  aiPreRouterDecision: AiPreRouterDecision | null;
  aiRawProviderResult: string | null;
  aiShouldSearchCatalog: boolean;
  aiSuggestedSongIds: string[];
  latestUserRequest: string;
  playbackState: PlaybackState;
  safetyReport: SafetyReport | null;
  selectedSongTitle: string;
  sourceMode: SourceMode;
  systemStatus: SystemStatus;
}) {
  const matchedSong = selectedSongTitle || (sourceMode === "youtube_placeholder" ? "No supported match" : "No song selected");

  return (
    <section className="rounded-lg border border-lime-300/20 bg-lime-300/[0.06] p-3 shadow-[0_16px_50px_rgba(0,0,0,0.28)]">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-lime-300">Guest Request Monitor</p>
          <h2 className="mt-0.5 text-base font-semibold text-slate-50">Visitor request handoff</h2>
        </div>
        <span className="rounded border border-emerald-300/30 bg-emerald-300/10 px-2.5 py-1 text-xs font-semibold text-emerald-100">
          {formatSystemStatus(systemStatus)}
        </span>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <MonitorItem label="Latest request" value={latestUserRequest ? `“${latestUserRequest}”` : "No guest request yet"} />
        <MonitorItem label="Matched song" value={matchedSong} />
        <MonitorItem label="Source mode" value={formatSourceMode(sourceMode)} />
        <MonitorItem label="Validation status" value={safetyReport?.overall ?? "Not run"} />
        <MonitorItem label="Playback status" value={formatPlaybackState(playbackState)} />
        <MonitorItem label="AI confidence" value={`${Math.round(aiConfidence * 100)}%`} />
      </div>
      <details className="mt-2 border-t border-white/10 pt-2">
        <summary className="cursor-pointer text-xs font-semibold text-slate-400 hover:text-slate-200">AI diagnostic details</summary>
        <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <MonitorItem label="Workflow status" value={formatSystemStatus(systemStatus)} />
          <MonitorItem label="AI mode" value={formatAiAssistantMode(aiAssistantMode)} />
          <MonitorItem label="AI intent" value={formatAiIntent(aiIntent)} />
          <MonitorItem label="Knowledge sections" value={aiKnowledgeSections.join(", ") || "None"} />
          <MonitorItem label="AI matched ID" value={aiMatchedSongId ?? "None"} />
          <MonitorItem label="Conversation state" value={formatAiConversationState(aiConversationState)} />
          <MonitorItem label="Pending song" value={aiPendingSongId ?? "None"} />
          <MonitorItem label="Pre-router decision" value={aiPreRouterDecision ? formatPreRouterDecision(aiPreRouterDecision) : "Passed to provider"} />
          <MonitorItem label="Raw provider result" value={aiRawProviderResult ?? "Not called"} />
          <MonitorItem label="Catalog search" value={aiShouldSearchCatalog ? "Yes" : "No"} />
          <MonitorItem label="Suggested IDs" value={aiSuggestedSongIds.join(", ") || "None"} />
          <MonitorItem label="Last unsupported" value={aiLastUnsupportedRequest ?? "None"} />
          <MonitorItem label="Fallback status" value={aiFallbackReason ?? "Primary provider"} />
          <MonitorItem label="Operator review" value={aiNeedsOperatorReview ? "Needed" : "Not needed"} />
        </div>
      </details>
    </section>
  );
}

function MonitorItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/30 px-3 py-2">
      <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">{label}</div>
      <div className="mt-1 truncate text-sm font-semibold text-slate-100" title={value}>{value}</div>
    </div>
  );
}

function formatPreRouterDecision(decision: AiPreRouterDecision): string {
  return decision.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());
}

function formatSourceMode(sourceMode: SourceMode): string {
  const labels: Record<SourceMode, string> = {
    library: "Supported Library",
    manual_upload: "Manual Upload",
    youtube_placeholder: "Future YouTube Placeholder",
  };
  return labels[sourceMode];
}

function formatSystemStatus(status: SystemStatus): string {
  const labels: Record<SystemStatus, string> = {
    idle: "Idle",
    playing: "Playing",
    request_received: "Request received",
    schedule_generated: "Schedule generated",
    stopped: "Stopped",
    unsupported: "Unsupported",
    validated: "Validated",
  };
  return labels[status];
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

function formatAiAssistantMode(mode: AiAssistantMode): string {
  const labels: Record<AiAssistantMode, string> = {
    local_fallback: "Local fallback",
    local_ollama: "Local Ollama",
    openai_optional: "OpenAI optional",
  };
  return labels[mode];
}

function formatAiIntent(intent: AiSongRequestIntent): string {
  const labels: Record<AiSongRequestIntent, string> = {
    ask_capabilities: "Ask capabilities",
    artist_request: "Artist request",
    confirmation_no: "Confirmation no",
    confirmation_yes: "Confirmation yes",
    explain_limitation: "Explain limitation",
    general_chat: "General chat",
    genre_request: "Genre request",
    greeting: "Greeting",
    list_songs: "List songs",
    mood_request: "Mood request",
    question_about_angklung: "Angklung question",
    question_about_machine: "Machine question",
    song_request: "Song request",
    suggest_song: "Suggest song",
    smalltalk: "Smalltalk",
    unknown: "Unknown",
    unsupported_song: "Unsupported song",
  };
  return labels[intent];
}

function formatAiConversationState(state: AiConversationState): string {
  const labels: Record<AiConversationState, string> = {
    awaiting_confirmation: "Awaiting confirmation",
    awaiting_song: "Awaiting song",
    idle: "Idle",
    ready_to_play: "Ready to play",
    unsupported: "Unsupported",
  };
  return labels[state];
}

function SongSourcePanel() {
  const system = useAngklungSystem();

  return (
    <section className="rounded-lg border border-white/10 bg-slate-950/78 p-4 shadow-[0_20px_70px_rgba(0,0,0,0.35)]">
      <h2 className="mb-3 text-lg font-semibold text-slate-50">Song Source</h2>
      <SongLibraryPicker
        onSelect={system.setSelectedSongId}
        selectedSongId={system.selectedSongId}
        songs={system.supportedSongs}
      />
      <label className="mt-4 block text-sm font-semibold text-slate-200">
        YouTube Piano Link
        <input
          className="mt-2 w-full rounded border border-white/10 bg-black/30 px-3 py-2 text-sm text-slate-500"
          value={system.youtubeUrl}
          onChange={(event) => system.setYoutubeUrl(event.target.value)}
          placeholder="Coming later / experimental"
          disabled
        />
      </label>
      <p className="mt-2 text-xs text-slate-400">YouTube conversion remains Phase 3. No download or transcription runs here.</p>
      <PlaybackControls
        arduinoConnection={system.arduinoConnection}
        disabled={!system.schedule || system.workflowStatus.readyForSimulation === false}
        embedded
        elapsedSeconds={system.elapsedSeconds}
        onEmergencyStop={system.emergencyStopPlayback}
        onConnectArduino={system.connectArduino}
        onDisconnectArduino={system.disconnectArduino}
        onGenerate={system.generateBuiltInSchedule}
        onPause={system.pausePlayback}
        onPlay={system.playSchedule}
        onReset={system.resetPlayback}
        onStop={system.stopPlayback}
        playbackState={system.playbackState}
        totalDurationSeconds={system.totalDuration}
      />
    </section>
  );
}

function CandidateYoutubePanel({ active }: { active: boolean }) {
  return (
    <details className={`rounded-lg border p-4 shadow-[0_20px_70px_rgba(0,0,0,0.35)] ${active ? "border-lime-300/40 bg-lime-300/10" : "border-white/10 bg-slate-950/78"}`}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
        <span className="text-sm font-semibold text-slate-50">YouTube Reference</span>
        <span className="rounded border border-lime-300/30 bg-lime-300/10 px-2 py-1 text-[10px] font-bold text-lime-200">Phase 3</span>
      </summary>
      <div className="mt-3 space-y-1 text-sm text-slate-300">
        <div>Video title: Simple piano reference placeholder</div>
        <div>Video URL: No candidate selected</div>
        <div>YouTube Piano Reference Mode: Coming later</div>
        <div>No audio download or transcription is currently running</div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button className="rounded border border-white/10 bg-white/5 px-3 py-2 text-sm font-semibold text-slate-500" disabled type="button">
          Approve
        </button>
        <button className="rounded border border-white/10 bg-white/5 px-3 py-2 text-sm font-semibold text-slate-500" disabled type="button">
          Reject
        </button>
      </div>
    </details>
  );
}

function AdvancedUploadPanel() {
  const system = useAngklungSystem();

  return (
    <details className="rounded-lg border border-white/10 bg-slate-950/78 p-4 shadow-[0_20px_70px_rgba(0,0,0,0.35)]">
      <summary className="cursor-pointer text-sm font-semibold text-slate-50">Advanced JSON Upload</summary>
      <p className="mb-3 mt-3 text-xs leading-relaxed text-slate-400">
        Load an existing actuator_schedule.v1 file for debugging or replay.
      </p>
      <ScheduleUploader onLoad={system.loadSchedule} />
    </details>
  );
}

function ArrangementStatusPanel({ report, song }: { report: SafetyReport | null; song: LoadedSong }) {
  const warningCount = report?.checks.filter((check) => check.status === "warning").length ?? 0;
  const failedCount = report?.checks.filter((check) => check.status === "failed").length ?? 0;

  return (
    <section className="rounded-lg border border-lime-300/20 bg-lime-300/[0.07] p-4 shadow-[0_20px_70px_rgba(0,0,0,0.35)]">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-50">Arrangement Status</h2>
          <p className="mt-1 text-xs text-slate-400">Phase 2 test library metadata</p>
        </div>
        <span className="rounded border border-lime-300/30 bg-lime-300/10 px-2 py-1 text-xs font-bold text-lime-200">Draft arrangement</span>
      </div>
      <div className="grid gap-2 text-sm md:grid-cols-2 xl:grid-cols-4">
        <StatusRow label="Song" value={song.title} />
        <StatusRow label="Rack map" value={song.physical_rack_map ?? "G3-C6"} />
        <StatusRow label="Arrangement status" value={formatArrangementStatus(song.arrangement_status)} wide />
        <StatusRow label="Melody register" value={formatRegister(song.melody_register)} />
        <StatusRow label="Melody range" value={song.melody_target_range ?? "Not specified"} />
        <StatusRow label="Accompaniment register" value={formatRegister(song.accompaniment_register)} />
        <StatusRow label="Accompaniment range" value={song.accompaniment_target_range ?? "Not specified"} />
        <StatusRow label="Demo safe" value={song.demo_safe ? "Yes" : "No"} />
        <StatusRow label="Notes count" value={String(song.notes.length)} />
        <StatusRow label="Validation result" value={report?.overall ?? "Not run"} />
        <StatusRow label="Warnings / errors" value={`${warningCount} warning${warningCount === 1 ? "" : "s"} / ${failedCount} error${failedCount === 1 ? "" : "s"}`} />
      </div>
      {song.reason && <p className="mt-3 rounded border border-white/10 bg-black/25 p-3 text-xs leading-relaxed text-slate-300">{song.reason}</p>}
    </section>
  );
}

function StatusRow({ label, value, wide = false }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={`grid grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] items-center gap-3 rounded border border-white/10 bg-black/25 px-3 py-2 ${wide ? "md:col-span-2" : ""}`}>
      <span className="min-w-0 text-slate-400">{label}</span>
      <span className="min-w-0 text-right font-semibold leading-snug text-slate-100 [overflow-wrap:anywhere]">{value}</span>
    </div>
  );
}

function formatArrangementStatus(status: string | undefined): string {
  if (status === "draft_layered_from_midi_needs_simplification") {
    return "Layered MIDI draft / needs simplification";
  }
  if (status === "draft_layered_from_midi_lower_pitch_needs_review") {
    return "Layered MIDI draft / lower-pitch / needs review";
  }
  if (status === "draft_layered_from_midi_g3_c6_upper_melody_needs_review") {
    return "G3-C6 layered MIDI draft / needs review";
  }
  if (status === "draft_layered_from_midi_g3_c6_needs_review") {
    return "G3-C6 layered MIDI draft / needs review";
  }
  if (status === "draft_layered_from_midi_g3_c6_lower_pitch_needs_review") {
    return "G3-C6 layered MIDI draft / lower pitch / needs review";
  }
  if (status === "needs_remap_to_g3_c6") {
    return "Needs remap to G3-C6";
  }
  if (status === "draft_from_midi_needs_simplification") {
    return "Draft from MIDI / needs simplification";
  }
  return status ?? "Unknown";
}

function formatRegister(register: string | undefined): string {
  if (!register) {
    return "Not specified";
  }
  if (register === "middle_lower") {
    return "Middle/lower";
  }
  if (register === "upper_physical") {
    return "Upper physical register";
  }
  if (register === "upper_physical_lowered_pitch") {
    return "G4-C6";
  }
  if (register === "lower_physical") {
    return "G3-F4";
  }
  return register.charAt(0).toUpperCase() + register.slice(1);
}

function ArrangementSettingsPanel() {
  const system = useAngklungSystem();
  const isHardwareTrial = system.selectedSong.category === "hardware_trial";

  return (
    <section className="rounded-lg border border-white/10 bg-slate-950/78 p-4 shadow-[0_20px_70px_rgba(0,0,0,0.35)]">
      <h2 className="mb-3 text-lg font-semibold text-slate-50">Arrangement Settings</h2>
      <div className="grid gap-3">
        <StrengthSlider
          value={system.settings.strength}
          onChange={(strength) => system.setSettings({ ...system.settings, strength })}
        />
        {isHardwareTrial ? (
          <div className="rounded border border-amber-300/20 bg-amber-300/[0.06] px-3 py-2.5">
            <div className="text-xs font-bold uppercase tracking-[0.12em] text-amber-200">Fixed trial timing</div>
            <div className="mt-1 text-sm text-slate-200">Normal tempo · exact arrangement notes only</div>
          </div>
        ) : (
          <>
            <SegmentedControl
              label="Tempo"
              value={system.settings.tempo}
              options={[
                ["normal", "Normal"],
                ["slower", "Slower"],
              ]}
              onChange={(value) => system.setSettings({ ...system.settings, tempo: value as ArrangementSettings["tempo"] })}
            />
            <SegmentedControl
              label="Mode"
              value={system.settings.mode}
              options={[
                ["melody", "Melody only"],
                ["harmony", "Melody + simple harmony"],
              ]}
              onChange={(value) => system.setSettings({ ...system.settings, mode: value as ArrangementSettings["mode"] })}
            />
          </>
        )}
      </div>
      <p className="mt-3 text-xs leading-relaxed text-slate-400">
        Strength controls simulator volume now and actuator intensity later. Rack map: G3-C6; verify final note labels with a tuner.
      </p>
    </section>
  );
}

function StrengthSlider({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return (
    <label className="block">
      <div className="mb-2 flex items-center justify-between gap-3 text-sm font-semibold text-slate-200">
        <span>Actuator Strength</span>
        <span className="rounded border border-white/10 bg-white/5 px-2 py-1 font-mono text-lime-200">{Math.round(value * 100)}%</span>
      </div>
      <input
        className="w-full accent-lime-300"
        max={1}
        min={0.2}
        onChange={(event) => onChange(Number(event.target.value))}
        step={0.05}
        type="range"
        value={value}
      />
      <div className="mt-1 flex justify-between text-xs text-slate-400">
        <span>Soft</span>
        <span>Strong</span>
      </div>
    </label>
  );
}

function SegmentedControl({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<[string, string]>;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <div className="mb-2 text-sm font-semibold text-slate-200">{label}</div>
      <div className="grid grid-cols-2 gap-2">
        {options.map(([optionValue, optionLabel]) => (
          <button
            className={`rounded border px-3 py-2 text-sm font-semibold ${
              value === optionValue ? "border-lime-300 bg-lime-300 text-slate-950" : "border-white/10 bg-white/5 text-slate-200 hover:border-lime-300/60"
            }`}
            key={optionValue}
            onClick={() => onChange(optionValue)}
            type="button"
          >
            {optionLabel}
          </button>
        ))}
      </div>
    </div>
  );
}

function WorkflowStatusPanel({ status }: { status: WorkflowStatus }) {
  const rows = [
    ["Request received", status.requestReceived ? "Done" : "Waiting", status.requestReceived],
    ["Library checked", status.libraryChecked ? "Done" : "Waiting", status.libraryChecked],
    [
      "Song found / not found",
      status.songFound === null ? "Waiting" : status.songFound ? "Found" : "Not found",
      status.songFound === true,
    ],
    ["Schedule generated", status.scheduleGenerated ? "Done" : "Waiting", status.scheduleGenerated],
    ["Validation passed", status.validationPassed ? "Done" : "Waiting", status.validationPassed],
    ["Ready for simulation", status.readyForSimulation ? "Done" : "Waiting", status.readyForSimulation],
  ] as const;

  return (
    <section className="rounded-lg border border-white/10 bg-slate-950/78 p-4 shadow-[0_20px_70px_rgba(0,0,0,0.35)]">
      <h2 className="mb-3 text-lg font-semibold text-slate-50">Workflow Status</h2>
      <div className="space-y-2">
        {rows.map(([label, stateLabel, passed]) => (
          <div className="flex items-center justify-between rounded border border-white/10 bg-white/5 px-3 py-2 text-sm" key={label}>
            <span className="font-medium text-slate-200">{label}</span>
            <span
              className={
                stateLabel === "Not found"
                  ? "font-semibold text-lime-200"
                  : passed
                    ? "font-semibold text-emerald-300"
                    : "font-semibold text-slate-500"
              }
            >
              {stateLabel}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function ValidationPanel({ report, errors }: { report: SafetyReport | null; errors: string[] }) {
  return (
    <section className="rounded-lg border border-white/10 bg-slate-950/78 p-4 shadow-[0_20px_70px_rgba(0,0,0,0.35)]">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-slate-50">Validation</h2>
        <span className={`rounded border px-2 py-1 text-xs font-bold ${report?.overall === "PASSED" ? "border-emerald-300/30 bg-emerald-300/10 text-emerald-200" : "border-white/10 bg-white/5 text-slate-500"}`}>
          {report?.overall ?? "NOT RUN"}
        </span>
      </div>
      {errors.length > 0 && (
        <div className="mb-3 rounded border border-red-400/40 bg-red-400/10 p-3 text-sm text-red-100">
          {errors.map((error) => (
            <div key={error}>{error}</div>
          ))}
        </div>
      )}
      <div className="space-y-2">
        {(report?.checks ?? []).map((check) => (
          <div className="rounded border border-white/10 bg-white/5 px-3 py-2 text-sm" key={check.label}>
            <div className="flex justify-between gap-3">
              <span className="font-semibold text-slate-200">{check.label}</span>
              <span className={check.status === "failed" ? "text-red-300" : check.status === "warning" ? "text-lime-200" : "text-emerald-300"}>
                {check.status.toUpperCase()}
              </span>
            </div>
            <div className="mt-1 text-slate-400">{check.detail}</div>
          </div>
        ))}
        {!report && errors.length === 0 && <div className="text-sm text-slate-400">Generate a song to run validation.</div>}
      </div>
    </section>
  );
}

function NotesPreview({ notes }: { notes: SongNote[] }) {
  return (
    <section className="rounded-lg border border-white/10 bg-slate-950/78 p-4 shadow-[0_20px_70px_rgba(0,0,0,0.35)]">
      <h2 className="mb-3 text-lg font-semibold text-slate-50">Notes Preview</h2>
      <div className="h-[clamp(360px,52vh,620px)] overflow-auto rounded border border-white/10 bg-black/55 p-4 font-mono text-sm text-slate-100">
        {notes.length === 0
          ? "Generate a built-in song to preview notes."
          : notes.map((note) => (
              <div key={`${note.start}-${note.note}`}>
                {note.start.toFixed(3)}s {note.note} {note.duration.toFixed(3)}s
              </div>
            ))}
      </div>
    </section>
  );
}

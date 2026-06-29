"use client";

import { AngklungRack } from "@/components/AngklungRack";
import {
  useAngklungSystem,
  type SourceMode,
  type SystemStatus,
  type WorkflowStatus,
} from "@/components/AngklungSystemProvider";
import { PlaybackControls } from "@/components/PlaybackControls";
import { ScheduleJsonViewer } from "@/components/ScheduleJsonViewer";
import { ScheduleUploader } from "@/components/ScheduleUploader";
import { TimelineView } from "@/components/TimelineView";
import type { BuiltInSongNote } from "@/lib/builtInSongs";
import type { ArrangementSettings } from "@/lib/scheduleBuilder";
import type { SafetyReport } from "@/lib/safetyValidator";
import type { PlaybackState } from "@/lib/types";

export default function ControlPage() {
  const system = useAngklungSystem();

  return (
    <main className="min-h-screen px-5 py-6 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-5">
        <section className="flex flex-wrap items-end justify-between gap-4 border-b border-white/10 pb-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-lime-300">Control Panel</p>
            <h2 className="mt-1 text-3xl font-bold text-slate-50">Operator System Monitor</h2>
            <p className="mt-2 max-w-2xl text-sm text-slate-300">
              This page shows what the computer is doing behind the scenes: selected song, schedule generation, validation,
              actuator timeline, virtual rack, JSON preview, and playback state.
            </p>
          </div>
          <div className="grid min-w-[280px] grid-cols-2 gap-2 rounded-lg border border-white/10 bg-white/5 p-3 text-sm text-slate-300">
            <Metric label="Source" value={system.sourceLabel} />
            <Metric label="Duration" value={`${system.totalDuration.toFixed(2)}s`} />
            <Metric label="Commands" value={String(system.schedule?.commands.length ?? 0)} />
            <Metric label="Playback" value={system.playbackState} />
          </div>
        </section>

        <GuestRequestMonitor
          latestUserRequest={system.latestUserRequest}
          playbackState={system.playbackState}
          safetyReport={system.safetyReport}
          selectedSongTitle={system.sourceMode === "youtube_placeholder" ? "" : system.selectedSong.title}
          sourceMode={system.sourceMode}
          systemStatus={system.systemStatus}
        />

        <AngklungRack instruments={system.instruments} activeInstrumentIds={system.activeInstrumentIds} />

        <section className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
          <div className="flex flex-col gap-4">
            <SongSourcePanel />
            <ArrangementSettingsPanel />
            <PlaybackControls
              disabled={!system.schedule || system.workflowStatus.readyForSimulation === false}
              playbackState={system.playbackState}
              elapsedSeconds={system.elapsedSeconds}
              totalDurationSeconds={system.totalDuration}
              onPlay={system.playSchedule}
              onPause={system.pausePlayback}
              onStop={system.stopPlayback}
              onReset={system.resetPlayback}
              onEmergencyStop={system.resetPlayback}
            />
            <CandidateYoutubePanel active={system.youtubeFallbackActive} />
            <section className="rounded-lg border border-white/10 bg-slate-950/78 p-4 shadow-[0_20px_70px_rgba(0,0,0,0.35)]">
              <h2 className="mb-3 text-lg font-semibold text-slate-50">Advanced Upload</h2>
              <p className="mb-3 text-sm text-slate-300">
                Upload an existing actuator_schedule.v1 JSON file for debugging or replay.
              </p>
              <ScheduleUploader onLoad={system.loadSchedule} />
            </section>
          </div>

          <div className="flex flex-col gap-4">
            <section className="grid gap-4 lg:grid-cols-2">
              <WorkflowStatusPanel status={system.workflowStatus} />
              <ValidationPanel report={system.safetyReport} errors={system.errors} />
            </section>
            <section className="grid gap-4 2xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
              <NotesPreview notes={system.generatedNotes} />
              <TimelineView commands={system.schedule?.commands ?? []} activeCommandIds={system.activeCommandIds} />
            </section>
            <ScheduleJsonViewer schedule={system.schedule} />
          </div>
        </section>
      </div>
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

function GuestRequestMonitor({
  latestUserRequest,
  playbackState,
  safetyReport,
  selectedSongTitle,
  sourceMode,
  systemStatus,
}: {
  latestUserRequest: string;
  playbackState: PlaybackState;
  safetyReport: SafetyReport | null;
  selectedSongTitle: string;
  sourceMode: SourceMode;
  systemStatus: SystemStatus;
}) {
  const matchedSong = selectedSongTitle || (sourceMode === "youtube_placeholder" ? "No supported match" : "No song selected");

  return (
    <section className="rounded-xl border border-lime-300/20 bg-lime-300/[0.07] p-4 shadow-[0_20px_70px_rgba(0,0,0,0.35)]">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-lime-300">Guest Request Monitor</p>
          <h2 className="mt-1 text-xl font-semibold text-slate-50">Visitor request handoff</h2>
        </div>
        <span className="rounded-full border border-emerald-300/30 bg-emerald-300/10 px-3 py-1 text-sm font-semibold text-emerald-100">
          {formatSystemStatus(systemStatus)}
        </span>
      </div>
      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        <MonitorItem label="Latest request" value={latestUserRequest ? `“${latestUserRequest}”` : "No guest request yet"} />
        <MonitorItem label="Matched song" value={matchedSong} />
        <MonitorItem label="Source mode" value={formatSourceMode(sourceMode)} />
        <MonitorItem label="Workflow status" value={formatSystemStatus(systemStatus)} />
        <MonitorItem label="Validation status" value={safetyReport?.overall ?? "Not run"} />
        <MonitorItem label="Playback status" value={formatPlaybackState(playbackState)} />
      </div>
    </section>
  );
}

function MonitorItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/30 px-3 py-2">
      <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">{label}</div>
      <div className="mt-1 truncate text-sm font-semibold text-slate-100">{value}</div>
    </div>
  );
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

function SongSourcePanel() {
  const system = useAngklungSystem();

  return (
    <section className="rounded-lg border border-white/10 bg-slate-950/78 p-4 shadow-[0_20px_70px_rgba(0,0,0,0.35)]">
      <h2 className="mb-3 text-lg font-semibold text-slate-50">Song Source</h2>
      <label className="block text-sm font-semibold text-slate-200">
        Built-in Song
        <select
          className="mt-2 w-full rounded border border-white/10 bg-black/45 px-3 py-2 text-sm text-slate-100 outline-none focus:border-lime-300/70"
          value={system.selectedSongId}
          onChange={(event) => system.setSelectedSongId(event.target.value)}
        >
          {system.supportedSongs.map((song) => (
            <option key={song.id} value={song.id}>
              {song.title}
            </option>
          ))}
        </select>
      </label>
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
      <button
        className="mt-4 w-full rounded bg-lime-300 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-lime-200"
        onClick={system.generateBuiltInSchedule}
        type="button"
      >
        Generate
      </button>
    </section>
  );
}

function CandidateYoutubePanel({ active }: { active: boolean }) {
  return (
    <section className={`rounded-lg border p-4 shadow-[0_20px_70px_rgba(0,0,0,0.35)] ${active ? "border-lime-300/40 bg-lime-300/10" : "border-white/10 bg-slate-950/78"}`}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-slate-50">Candidate YouTube Reference</h2>
        <span className="rounded border border-lime-300/30 bg-lime-300/10 px-2 py-1 text-xs font-bold text-lime-200">Coming in Phase 3</span>
      </div>
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
    </section>
  );
}

function ArrangementSettingsPanel() {
  const system = useAngklungSystem();

  return (
    <section className="rounded-lg border border-white/10 bg-slate-950/78 p-4 shadow-[0_20px_70px_rgba(0,0,0,0.35)]">
      <h2 className="mb-3 text-lg font-semibold text-slate-50">Arrangement Settings</h2>
      <div className="grid gap-3">
        <StrengthSlider
          value={system.settings.strength}
          onChange={(strength) => system.setSettings({ ...system.settings, strength })}
        />
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
      </div>
      <p className="mt-3 text-xs text-slate-400">Strength controls simulator volume now and actuator intensity later.</p>
      <div className="mt-4 rounded border border-white/10 bg-white/5 px-3 py-2 text-sm font-semibold text-slate-200">Range: 2.5-octave angklung</div>
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

function NotesPreview({ notes }: { notes: BuiltInSongNote[] }) {
  return (
    <section className="rounded-lg border border-white/10 bg-slate-950/78 p-4 shadow-[0_20px_70px_rgba(0,0,0,0.35)]">
      <h2 className="mb-3 text-lg font-semibold text-slate-50">Notes Preview</h2>
      <div className="max-h-48 overflow-auto rounded border border-white/10 bg-black/55 p-4 font-mono text-sm text-slate-100">
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

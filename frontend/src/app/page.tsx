"use client";

import { useMemo, useRef, useState } from "react";
import { AngklungRack } from "@/components/AngklungRack";
import { PlaybackControls } from "@/components/PlaybackControls";
import { ScheduleJsonViewer } from "@/components/ScheduleJsonViewer";
import { ScheduleUploader } from "@/components/ScheduleUploader";
import { TimelineView } from "@/components/TimelineView";
import { AudioEngine } from "@/lib/audioEngine";
import { BUILT_IN_SONGS, type BuiltInSong, type BuiltInSongNote } from "@/lib/builtInSongs";
import { buildFullAngklungRack } from "@/lib/instrumentMap";
import { PlaybackEngine } from "@/lib/playbackEngine";
import { type ArrangementSettings, buildScheduleFromBuiltInSong, scaleNotes } from "@/lib/scheduleBuilder";
import { validateSchedulePayload } from "@/lib/scheduleValidator";
import { type SafetyReport, validateMotorSafety } from "@/lib/safetyValidator";
import type { ActuatorCommand, ActuatorSchedule, PlaybackState, RackInstrument } from "@/lib/types";

type ConversionStatus = {
  requestReceived: boolean;
  libraryChecked: boolean;
  songFound: boolean | null;
  scheduleGenerated: boolean;
  validationPassed: boolean;
  readyForSimulation: boolean;
};

type AssistantMessage = {
  id: number;
  speaker: "assistant" | "user";
  text: string;
};

const DEFAULT_SETTINGS: ArrangementSettings = {
  strength: 0.8,
  tempo: "normal",
  mode: "melody",
};

const INITIAL_ASSISTANT_MESSAGES: AssistantMessage[] = [
  {
    id: 1,
    speaker: "assistant",
    text: "Hi, what song would you like to hear?",
  },
];

const SONG_ALIASES: Record<string, string[]> = {
  happy_birthday: ["happy birthday", "birthday"],
  ode_to_joy: ["ode to joy", "ode"],
  twinkle_twinkle: ["twinkle", "twinkle twinkle"],
};

export default function Home() {
  const [selectedSongId, setSelectedSongId] = useState(BUILT_IN_SONGS[0].id);
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [settings, setSettings] = useState<ArrangementSettings>(DEFAULT_SETTINGS);
  const [schedule, setSchedule] = useState<ActuatorSchedule | null>(null);
  const [generatedNotes, setGeneratedNotes] = useState<BuiltInSongNote[]>([]);
  const [sourceLabel, setSourceLabel] = useState<string>("Built-in song ready");
  const [errors, setErrors] = useState<string[]>([]);
  const [safetyReport, setSafetyReport] = useState<SafetyReport | null>(null);
  const [conversionStatus, setConversionStatus] = useState<ConversionStatus>({
    requestReceived: false,
    libraryChecked: false,
    songFound: null,
    scheduleGenerated: false,
    validationPassed: false,
    readyForSimulation: false,
  });
  const [assistantInput, setAssistantInput] = useState("");
  const [assistantMessages, setAssistantMessages] = useState<AssistantMessage[]>(INITIAL_ASSISTANT_MESSAGES);
  const [youtubeFallbackActive, setYoutubeFallbackActive] = useState(false);
  const [playbackState, setPlaybackState] = useState<PlaybackState>("idle");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [activeCommandIds, setActiveCommandIds] = useState<Set<string>>(new Set());
  const [activeInstrumentIds, setActiveInstrumentIds] = useState<Set<string>>(new Set());
  const engineRef = useRef<PlaybackEngine | null>(null);
  const audioRef = useRef<AudioEngine | null>(null);

  const selectedSong = useMemo(
    () => BUILT_IN_SONGS.find((song) => song.id === selectedSongId) ?? BUILT_IN_SONGS[0],
    [selectedSongId],
  );
  const instruments = useMemo(() => buildFullAngklungRack(), []);
  const totalDuration = schedule?.timing.total_duration_seconds ?? 0;

  function generateScheduleForSong(song: BuiltInSong): SafetyReport | null {
    stopPlayback();
    try {
      const nextSchedule = buildScheduleFromBuiltInSong(song, settings);
      const validationResult = validateSchedulePayload(nextSchedule);
      const nextSafetyReport = validateMotorSafety(nextSchedule);

      if (!validationResult.ok) {
        setErrors(validationResult.errors);
        setSchedule(null);
        setSafetyReport(null);
        setConversionStatus({
          requestReceived: true,
          libraryChecked: true,
          songFound: true,
          scheduleGenerated: false,
          validationPassed: false,
          readyForSimulation: false,
        });
        return null;
      }

      setSchedule(validationResult.schedule);
      setGeneratedNotes(scaleNotes(song.notes, settings.tempo === "slower" ? 1.25 : 1));
      setSafetyReport(nextSafetyReport);
      setSourceLabel(song.title);
      setErrors([]);
      setPlaybackState("idle");
      setElapsedSeconds(0);
      setYoutubeFallbackActive(false);
      setConversionStatus({
        requestReceived: true,
        libraryChecked: true,
        songFound: true,
        scheduleGenerated: true,
        validationPassed: nextSafetyReport.overall === "PASSED",
        readyForSimulation: nextSafetyReport.overall === "PASSED",
      });
      return nextSafetyReport;
    } catch (error) {
      setErrors([error instanceof Error ? error.message : "Unable to generate schedule."]);
      return null;
    }
  }

  function generateBuiltInSchedule() {
    generateScheduleForSong(selectedSong);
  }

  function handleAssistantRequest(request: string) {
    const trimmedRequest = request.trim();
    if (!trimmedRequest) {
      return;
    }

    const nextMessages: AssistantMessage[] = [
      {
        id: Date.now(),
        speaker: "user",
        text: trimmedRequest,
      },
      {
        id: Date.now() + 1,
        speaker: "assistant",
        text: "Checking supported song library...",
      },
    ];
    const matchedSong = findBuiltInSong(trimmedRequest);

    setAssistantInput("");
    setConversionStatus({
      requestReceived: true,
      libraryChecked: true,
      songFound: Boolean(matchedSong),
      scheduleGenerated: false,
      validationPassed: false,
      readyForSimulation: false,
    });

    if (!matchedSong) {
      stopPlayback();
      setYoutubeFallbackActive(true);
      setSchedule(null);
      setGeneratedNotes([]);
      setSourceLabel("Unsupported song request");
      setErrors([]);
      setSafetyReport(null);
      nextMessages.push({
        id: Date.now() + 2,
        speaker: "assistant",
        text: "This song is not in the supported library yet. In Phase 3, I will search YouTube for a simple piano version and ask for approval before conversion.",
      });
      nextMessages.push({
        id: Date.now() + 3,
        speaker: "assistant",
        text: "Sorry, this song is not currently supported. I could not find a supported built-in arrangement yet. In the future, the AI will search for a simple piano reference, ask for approval, and attempt conversion only if the melody fits our 2.5-octave angklung rack.",
      });
      setAssistantMessages((current) => [...current, ...nextMessages]);
      return;
    }

    setSelectedSongId(matchedSong.id);
    const report = generateScheduleForSong(matchedSong);
    nextMessages.push({
      id: Date.now() + 2,
      speaker: "assistant",
      text: `Found supported arrangement: ${matchedSong.title}.`,
    });
    nextMessages.push({
      id: Date.now() + 3,
      speaker: "assistant",
      text: "Generating actuator schedule...",
    });
    nextMessages.push({
      id: Date.now() + 4,
      speaker: "assistant",
      text:
        report?.overall === "PASSED"
          ? "Validation passed. Ready to simulate."
          : "Validation did not pass. Review the validation panel before simulation.",
    });
    setAssistantMessages((current) => [...current, ...nextMessages]);
  }

  function loadSchedule(fileText: string, uploadedFileName: string) {
    stopPlayback();
    try {
      const parsed = JSON.parse(fileText) as unknown;
      const result = validateSchedulePayload(parsed);
      if (!result.ok) {
        setSchedule(null);
        setSafetyReport(null);
        setSourceLabel(uploadedFileName);
        setErrors(result.errors);
        setConversionStatus({
          requestReceived: true,
          libraryChecked: false,
          songFound: null,
          scheduleGenerated: false,
          validationPassed: false,
          readyForSimulation: false,
        });
        return;
      }

      const nextSafetyReport = validateMotorSafety(result.schedule);
      setSchedule(result.schedule);
      setGeneratedNotes(
        result.schedule.commands.map((command) => ({
          note: command.note,
          start: command.start_time_seconds,
          duration: command.duration_seconds,
        })),
      );
      setSafetyReport(nextSafetyReport);
      setSourceLabel(uploadedFileName);
      setErrors([]);
      setPlaybackState("idle");
      setElapsedSeconds(0);
      setYoutubeFallbackActive(false);
      setConversionStatus({
        requestReceived: true,
        libraryChecked: false,
        songFound: null,
        scheduleGenerated: true,
        validationPassed: nextSafetyReport.overall === "PASSED",
        readyForSimulation: nextSafetyReport.overall === "PASSED",
      });
    } catch (error) {
      setSchedule(null);
      setSafetyReport(null);
      setSourceLabel(uploadedFileName);
      setErrors([error instanceof Error ? error.message : "Unable to parse JSON file."]);
    }
  }

  async function playSchedule() {
    if (!schedule || playbackState === "playing") {
      return;
    }

    audioRef.current ??= new AudioEngine();
    try {
      await audioRef.current.ensureReady();
      setErrors([]);
    } catch (error) {
      setErrors([error instanceof Error ? error.message : "Audio could not start. Check browser audio permissions and output volume."]);
      return;
    }

    const engine = new PlaybackEngine(schedule.commands, totalDuration, {
      onCommand: (command) => triggerCommand(command),
      onTimeUpdate: setElapsedSeconds,
      onComplete: () => {
        setPlaybackState("stopped");
        setActiveCommandIds(new Set());
        setActiveInstrumentIds(new Set());
      },
    });
    engineRef.current = engine;
    setPlaybackState("playing");
    engine.play(elapsedSeconds >= totalDuration ? 0 : elapsedSeconds);
  }

  function pausePlayback() {
    if (!engineRef.current || playbackState !== "playing") {
      return;
    }
    setElapsedSeconds(engineRef.current.pause());
    setPlaybackState("paused");
  }

  function stopPlayback() {
    engineRef.current?.stop();
    engineRef.current = null;
    setPlaybackState("stopped");
    setElapsedSeconds(0);
    setActiveCommandIds(new Set());
    setActiveInstrumentIds(new Set());
  }

  function resetPlayback() {
    stopPlayback();
    setPlaybackState("idle");
  }

  function triggerCommand(command: ActuatorCommand) {
    audioRef.current?.playNote(command.note, command.duration_seconds, command.strength);

    setActiveCommandIds((current) => new Set(current).add(command.command_id));
    setActiveInstrumentIds((current) => new Set(current).add(command.instrument_id));

    window.setTimeout(() => {
      setActiveCommandIds((current) => {
        const next = new Set(current);
        next.delete(command.command_id);
        return next;
      });
      setActiveInstrumentIds((current) => {
        const next = new Set(current);
        next.delete(command.instrument_id);
        return next;
      });
    }, Math.max(120, command.duration_seconds * 1000));
  }

  return (
    <main className="min-h-screen px-5 py-6 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-5">
        <header className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-300 pb-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-sky-700">Phase 1 control UI</p>
            <h1 className="mt-1 text-3xl font-bold text-slate-950">AI Angklung Performance Console</h1>
          </div>
          <div className="text-right text-sm text-slate-600">
            <div>{schedule ? schedule.song.title : "No schedule generated"}</div>
            <div>{sourceLabel}</div>
          </div>
        </header>

        <section className="grid gap-4 xl:grid-cols-[390px_1fr]">
          <div className="flex flex-col gap-4">
            <AiSongAssistantPanel
              inputValue={assistantInput}
              messages={assistantMessages}
              supportedSongs={BUILT_IN_SONGS}
              youtubeFallbackActive={youtubeFallbackActive}
              onInputChange={setAssistantInput}
              onRequestSong={handleAssistantRequest}
            />
            <SongSourcePanel
              selectedSongId={selectedSongId}
              youtubeUrl={youtubeUrl}
              onSongChange={setSelectedSongId}
              onYoutubeUrlChange={setYoutubeUrl}
              onGenerate={generateBuiltInSchedule}
            />
            <ArrangementSettingsPanel settings={settings} onChange={setSettings} />
            <ConversionStatusPanel status={conversionStatus} />
            <ValidationPanel report={safetyReport} errors={errors} />
            <PlaybackControls
              disabled={!schedule || conversionStatus.readyForSimulation === false}
              playbackState={playbackState}
              elapsedSeconds={elapsedSeconds}
              totalDurationSeconds={totalDuration}
              onPlay={playSchedule}
              onPause={pausePlayback}
              onStop={stopPlayback}
              onReset={resetPlayback}
              onEmergencyStop={resetPlayback}
            />
            <section className="rounded border border-slate-300 bg-white p-4 shadow-sm">
              <h2 className="mb-3 text-lg font-semibold text-slate-950">Advanced Upload</h2>
              <p className="mb-3 text-sm text-slate-600">
                Upload an existing actuator_schedule.v1 JSON file for debugging or replay.
              </p>
              <ScheduleUploader onLoad={loadSchedule} />
            </section>
          </div>

          <div className="flex flex-col gap-4">
            <AngklungRack instruments={instruments} activeInstrumentIds={activeInstrumentIds} />
            <NotesPreview notes={generatedNotes} />
            <TimelineView commands={schedule?.commands ?? []} activeCommandIds={activeCommandIds} />
            <ScheduleJsonViewer schedule={schedule} />
          </div>
        </section>
      </div>
    </main>
  );
}

function AiSongAssistantPanel({
  inputValue,
  messages,
  supportedSongs,
  youtubeFallbackActive,
  onInputChange,
  onRequestSong,
}: {
  inputValue: string;
  messages: AssistantMessage[];
  supportedSongs: BuiltInSong[];
  youtubeFallbackActive: boolean;
  onInputChange: (value: string) => void;
  onRequestSong: (request: string) => void;
}) {
  return (
    <section className="rounded border border-slate-300 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-950">AI Song Assistant</h2>
          <p className="mt-1 text-xs text-slate-500">Preloaded songs are reliable. YouTube conversion is experimental and not running.</p>
        </div>
        <span className="rounded bg-sky-100 px-2 py-1 text-xs font-bold text-sky-800">Phase 1</span>
      </div>

      <div className="max-h-64 space-y-2 overflow-auto rounded bg-slate-50 p-3">
        {messages.map((message) => (
          <div
            className={`rounded px-3 py-2 text-sm ${
              message.speaker === "assistant" ? "mr-6 bg-white text-slate-700 shadow-sm" : "ml-6 bg-sky-700 text-white"
            }`}
            key={message.id}
          >
            {message.text}
          </div>
        ))}
      </div>

      <form
        className="mt-3 grid gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          onRequestSong(inputValue);
        }}
      >
        <input
          className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm"
          onChange={(event) => onInputChange(event.target.value)}
          placeholder="Ask for a song, e.g. twinkle"
          value={inputValue}
        />
        <button className="rounded bg-sky-700 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-800" type="submit">
          Ask / Request Song
        </button>
      </form>

      <div className="mt-3">
        <div className="mb-2 text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Supported quick picks</div>
        <div className="flex flex-wrap gap-2">
          {supportedSongs.map((song) => (
            <button
              className="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-sky-700 hover:text-sky-800"
              key={song.id}
              onClick={() => onRequestSong(song.title)}
              type="button"
            >
              {displaySongTitle(song.title)}
            </button>
          ))}
        </div>
      </div>

      <div className={`mt-4 rounded border p-3 ${youtubeFallbackActive ? "border-amber-300 bg-amber-50" : "border-slate-200 bg-slate-50"}`}>
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-bold text-slate-900">Candidate YouTube Reference</h3>
          <span className="rounded bg-slate-200 px-2 py-1 text-xs font-bold text-slate-600">Coming in Phase 3</span>
        </div>
        <div className="mt-2 space-y-1 text-xs text-slate-600">
          <div>Video title: Simple piano reference placeholder</div>
          <div>Video URL: No candidate selected</div>
          <div>YouTube Piano Reference Mode: Coming later</div>
          <div>No audio download or transcription is currently running</div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button className="rounded border border-slate-300 bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-400" disabled type="button">
            Approve
          </button>
          <button className="rounded border border-slate-300 bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-400" disabled type="button">
            Reject
          </button>
        </div>
      </div>

      <p className="mt-3 text-xs text-slate-500">
        Songs with unsupported sharps, flats, or notes outside the 2.5-octave angklung rack are rejected instead of forced into playback.
      </p>
    </section>
  );
}

function findBuiltInSong(request: string): BuiltInSong | null {
  const normalizedRequest = normalizeSongText(request);
  if (!normalizedRequest) {
    return null;
  }

  return (
    BUILT_IN_SONGS.find((song) => {
      const normalizedTitle = normalizeSongText(song.title);
      const aliases = SONG_ALIASES[song.id] ?? [];

      return (
        normalizedTitle.includes(normalizedRequest) ||
        normalizedRequest.includes(normalizedTitle) ||
        aliases.some((alias) => {
          const normalizedAlias = normalizeSongText(alias);
          return normalizedAlias.includes(normalizedRequest) || normalizedRequest.includes(normalizedAlias);
        })
      );
    }) ?? null
  );
}

function normalizeSongText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function displaySongTitle(title: string): string {
  return title.replace(/\s+[^a-zA-Z0-9\s]+?\s+Layered Angklung$/, "");
}

function SongSourcePanel({
  selectedSongId,
  youtubeUrl,
  onSongChange,
  onYoutubeUrlChange,
  onGenerate,
}: {
  selectedSongId: string;
  youtubeUrl: string;
  onSongChange: (songId: string) => void;
  onYoutubeUrlChange: (url: string) => void;
  onGenerate: () => void;
}) {
  return (
    <section className="rounded border border-slate-300 bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-lg font-semibold text-slate-950">Song Source</h2>
      <label className="block text-sm font-semibold text-slate-800">
        Built-in Song
        <select
          className="mt-2 w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm"
          value={selectedSongId}
          onChange={(event) => onSongChange(event.target.value)}
        >
          {BUILT_IN_SONGS.map((song) => (
            <option key={song.id} value={song.id}>
              {song.title}
            </option>
          ))}
        </select>
      </label>
      <label className="mt-4 block text-sm font-semibold text-slate-800">
        YouTube Piano Link
        <input
          className="mt-2 w-full rounded border border-slate-300 bg-slate-100 px-3 py-2 text-sm text-slate-500"
          value={youtubeUrl}
          onChange={(event) => onYoutubeUrlChange(event.target.value)}
          placeholder="Coming later / experimental"
          disabled
        />
      </label>
      <p className="mt-2 text-xs text-slate-500">YouTube conversion remains Phase 3. No download or transcription runs here.</p>
      <button className="mt-4 w-full rounded bg-sky-700 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-800" onClick={onGenerate}>
        Generate
      </button>
    </section>
  );
}

function ArrangementSettingsPanel({
  settings,
  onChange,
}: {
  settings: ArrangementSettings;
  onChange: (settings: ArrangementSettings) => void;
}) {
  return (
    <section className="rounded border border-slate-300 bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-lg font-semibold text-slate-950">Arrangement Settings</h2>
      <div className="grid gap-3">
        <StrengthSlider
          value={settings.strength}
          onChange={(strength) => onChange({ ...settings, strength })}
        />
        <SegmentedControl
          label="Tempo"
          value={settings.tempo}
          options={[
            ["normal", "Normal"],
            ["slower", "Slower"],
          ]}
          onChange={(value) => onChange({ ...settings, tempo: value as ArrangementSettings["tempo"] })}
        />
        <SegmentedControl
          label="Mode"
          value={settings.mode}
          options={[
            ["melody", "Melody only"],
            ["harmony", "Melody + simple harmony"],
          ]}
          onChange={(value) => onChange({ ...settings, mode: value as ArrangementSettings["mode"] })}
        />
      </div>
      <p className="mt-3 text-xs text-slate-500">Strength controls simulator volume now and actuator intensity later.</p>
      <div className="mt-4 rounded bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-700">Range: 2.5-octave angklung</div>
    </section>
  );
}

function StrengthSlider({
  value,
  onChange,
}: {
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block">
      <div className="mb-2 flex items-center justify-between gap-3 text-sm font-semibold text-slate-800">
        <span>Actuator Strength</span>
        <span className="rounded bg-slate-100 px-2 py-1 font-mono text-slate-700">{Math.round(value * 100)}%</span>
      </div>
      <input
        className="w-full accent-sky-700"
        max={1}
        min={0.2}
        onChange={(event) => onChange(Number(event.target.value))}
        step={0.05}
        type="range"
        value={value}
      />
      <div className="mt-1 flex justify-between text-xs text-slate-500">
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
      <div className="mb-2 text-sm font-semibold text-slate-800">{label}</div>
      <div className="grid grid-cols-2 gap-2">
        {options.map(([optionValue, optionLabel]) => (
          <button
            className={`rounded border px-3 py-2 text-sm font-semibold ${
              value === optionValue ? "border-sky-700 bg-sky-700 text-white" : "border-slate-300 bg-white text-slate-700"
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

function ConversionStatusPanel({ status }: { status: ConversionStatus }) {
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
    <section className="rounded border border-slate-300 bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-lg font-semibold text-slate-950">Workflow Status</h2>
      <div className="space-y-2">
        {rows.map(([label, stateLabel, passed]) => (
          <div className="flex items-center justify-between rounded bg-slate-50 px-3 py-2 text-sm" key={label}>
            <span className="font-medium text-slate-800">{label}</span>
            <span
              className={
                stateLabel === "Not found"
                  ? "font-semibold text-amber-700"
                  : passed
                    ? "font-semibold text-emerald-700"
                    : "font-semibold text-slate-400"
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
    <section className="rounded border border-slate-300 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-slate-950">Validation</h2>
        <span className={`rounded px-2 py-1 text-xs font-bold ${report?.overall === "PASSED" ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-500"}`}>
          {report?.overall ?? "NOT RUN"}
        </span>
      </div>
      {errors.length > 0 && (
        <div className="mb-3 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-900">
          {errors.map((error) => (
            <div key={error}>{error}</div>
          ))}
        </div>
      )}
      <div className="space-y-2">
        {(report?.checks ?? []).map((check) => (
          <div className="rounded bg-slate-50 px-3 py-2 text-sm" key={check.label}>
            <div className="flex justify-between gap-3">
              <span className="font-semibold text-slate-800">{check.label}</span>
              <span className={check.status === "failed" ? "text-red-700" : check.status === "warning" ? "text-amber-700" : "text-emerald-700"}>
                {check.status.toUpperCase()}
              </span>
            </div>
            <div className="mt-1 text-slate-600">{check.detail}</div>
          </div>
        ))}
        {!report && errors.length === 0 && <div className="text-sm text-slate-500">Generate a song to run validation.</div>}
      </div>
    </section>
  );
}

function NotesPreview({ notes }: { notes: BuiltInSongNote[] }) {
  return (
    <section className="rounded border border-slate-300 bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-lg font-semibold text-slate-950">Notes Preview</h2>
      <div className="max-h-48 overflow-auto rounded bg-slate-950 p-4 font-mono text-sm text-slate-100">
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

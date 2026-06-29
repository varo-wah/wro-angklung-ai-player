"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { AudioEngine } from "@/lib/audioEngine";
import { BUILT_IN_SONGS, type BuiltInSong, type BuiltInSongNote } from "@/lib/builtInSongs";
import { buildFullAngklungRack } from "@/lib/instrumentMap";
import { PlaybackEngine } from "@/lib/playbackEngine";
import { type ArrangementSettings, buildScheduleFromBuiltInSong, scaleNotes } from "@/lib/scheduleBuilder";
import { type SafetyReport, validateMotorSafety } from "@/lib/safetyValidator";
import { validateSchedulePayload } from "@/lib/scheduleValidator";
import type { ActuatorCommand, ActuatorSchedule, PlaybackState, RackInstrument } from "@/lib/types";

export type SourceMode = "library" | "youtube_placeholder" | "manual_upload";
export type SystemStatus = "idle" | "request_received" | "schedule_generated" | "validated" | "playing" | "stopped" | "unsupported";

export type ChatMessage = {
  id: number;
  speaker: "assistant" | "user";
  text: string;
};

export type WorkflowStatus = {
  requestReceived: boolean;
  libraryChecked: boolean;
  songFound: boolean | null;
  scheduleGenerated: boolean;
  validationPassed: boolean;
  readyForSimulation: boolean;
};

type AngklungSystemContextValue = {
  activeCommandIds: Set<string>;
  activeInstrumentIds: Set<string>;
  chatInput: string;
  chatMessages: ChatMessage[];
  elapsedSeconds: number;
  errors: string[];
  generatedNotes: BuiltInSongNote[];
  instruments: RackInstrument[];
  latestUserRequest: string;
  playbackState: PlaybackState;
  safetyReport: SafetyReport | null;
  schedule: ActuatorSchedule | null;
  selectedSong: BuiltInSong;
  selectedSongId: string;
  settings: ArrangementSettings;
  sourceLabel: string;
  sourceMode: SourceMode;
  supportedSongs: BuiltInSong[];
  systemStatus: SystemStatus;
  totalDuration: number;
  workflowStatus: WorkflowStatus;
  youtubeFallbackActive: boolean;
  youtubeUrl: string;
  generateBuiltInSchedule: () => void;
  loadSchedule: (fileText: string, uploadedFileName: string) => void;
  pausePlayback: () => void;
  playSchedule: () => Promise<void>;
  requestSong: (request: string) => void;
  resetPlayback: () => void;
  setChatInput: (value: string) => void;
  setSelectedSongId: (songId: string) => void;
  setSettings: (settings: ArrangementSettings) => void;
  setYoutubeUrl: (url: string) => void;
  stopPlayback: () => void;
};

const DEFAULT_SETTINGS: ArrangementSettings = {
  strength: 0.8,
  tempo: "normal",
  mode: "melody",
};

const INITIAL_CHAT_MESSAGES: ChatMessage[] = [
  {
    id: 1,
    speaker: "assistant",
    text: "Hi, what song would you like to hear?",
  },
];

const INITIAL_WORKFLOW_STATUS: WorkflowStatus = {
  requestReceived: false,
  libraryChecked: false,
  songFound: null,
  scheduleGenerated: false,
  validationPassed: false,
  readyForSimulation: false,
};

const SONG_ALIASES: Record<string, string[]> = {
  happy_birthday: ["happy birthday", "birthday"],
  ode_to_joy: ["ode to joy", "ode"],
  twinkle_twinkle: ["twinkle", "twinkle twinkle"],
};

const AngklungSystemContext = createContext<AngklungSystemContextValue | null>(null);

export function AngklungSystemProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [selectedSongId, setSelectedSongId] = useState(BUILT_IN_SONGS[0].id);
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [settings, setSettings] = useState<ArrangementSettings>(DEFAULT_SETTINGS);
  const [schedule, setSchedule] = useState<ActuatorSchedule | null>(null);
  const [generatedNotes, setGeneratedNotes] = useState<BuiltInSongNote[]>([]);
  const [sourceLabel, setSourceLabel] = useState<string>("Built-in song ready");
  const [sourceMode, setSourceMode] = useState<SourceMode>("library");
  const [latestUserRequest, setLatestUserRequest] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [safetyReport, setSafetyReport] = useState<SafetyReport | null>(null);
  const [workflowStatus, setWorkflowStatus] = useState<WorkflowStatus>(INITIAL_WORKFLOW_STATUS);
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(INITIAL_CHAT_MESSAGES);
  const [youtubeFallbackActive, setYoutubeFallbackActive] = useState(false);
  const [playbackState, setPlaybackState] = useState<PlaybackState>("idle");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [activeCommandIds, setActiveCommandIds] = useState<Set<string>>(new Set());
  const [activeInstrumentIds, setActiveInstrumentIds] = useState<Set<string>>(new Set());
  const [systemStatus, setSystemStatus] = useState<SystemStatus>("idle");
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
        setSystemStatus("request_received");
        setWorkflowStatus({
          requestReceived: true,
          libraryChecked: true,
          songFound: true,
          scheduleGenerated: false,
          validationPassed: false,
          readyForSimulation: false,
        });
        return null;
      }

      const validationPassed = nextSafetyReport.overall === "PASSED";
      setSchedule(validationResult.schedule);
      setGeneratedNotes(scaleNotes(song.notes, settings.tempo === "slower" ? 1.25 : 1));
      setSafetyReport(nextSafetyReport);
      setSourceLabel(song.title);
      setSourceMode("library");
      setErrors([]);
      setPlaybackState("idle");
      setElapsedSeconds(0);
      setYoutubeFallbackActive(false);
      setSystemStatus(validationPassed ? "validated" : "schedule_generated");
      setWorkflowStatus({
        requestReceived: true,
        libraryChecked: true,
        songFound: true,
        scheduleGenerated: true,
        validationPassed,
        readyForSimulation: validationPassed,
      });
      return nextSafetyReport;
    } catch (error) {
      setErrors([error instanceof Error ? error.message : "Unable to generate schedule."]);
      return null;
    }
  }

  function generateBuiltInSchedule() {
    setLatestUserRequest(selectedSong.title);
    generateScheduleForSong(selectedSong);
  }

  function requestSong(request: string) {
    const trimmedRequest = request.trim();
    if (!trimmedRequest) {
      return;
    }

    const timestamp = Date.now();
    const nextMessages: ChatMessage[] = [
      { id: timestamp, speaker: "user", text: trimmedRequest },
      { id: timestamp + 1, speaker: "assistant", text: "Checking the supported song library..." },
    ];
    const matchedSong = findBuiltInSong(trimmedRequest);

    setChatInput("");
    setLatestUserRequest(trimmedRequest);
    setSystemStatus("request_received");
    setWorkflowStatus({
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
      setSourceMode("youtube_placeholder");
      setSchedule(null);
      setGeneratedNotes([]);
      setSourceLabel("Unsupported song request");
      setErrors([]);
      setSafetyReport(null);
      setSystemStatus("unsupported");
      nextMessages.push(
        {
          id: timestamp + 2,
          speaker: "assistant",
          text: "I could not find a supported arrangement for that song yet.",
        },
        {
          id: timestamp + 3,
          speaker: "assistant",
          text: "In the future, I can search for a simple piano YouTube reference and ask for approval before conversion.",
        },
        {
          id: timestamp + 4,
          speaker: "assistant",
          text: "For now, please choose a supported song from the list.",
        },
        {
          id: timestamp + 5,
          speaker: "assistant",
          text: "This song is not currently supported. Future YouTube Piano Reference Mode will only continue if the melody fits our 2.5-octave angklung rack.",
        },
      );
      setChatMessages((current) => [...current, ...nextMessages]);
      return;
    }

    setSelectedSongId(matchedSong.id);
    const report = generateScheduleForSong(matchedSong);
    nextMessages.push(
      {
        id: timestamp + 2,
        speaker: "assistant",
        text: `I found a supported arrangement: ${matchedSong.title}.`,
      },
      {
        id: timestamp + 3,
        speaker: "assistant",
        text: "Generating the angklung schedule...",
      },
      {
        id: timestamp + 4,
        speaker: "assistant",
        text: report?.overall === "PASSED" ? "Validation passed. Ready to play." : "Validation did not pass. The operator should review the control panel.",
      },
    );
    setChatMessages((current) => [...current, ...nextMessages]);
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
        setSourceMode("manual_upload");
        setErrors(result.errors);
        setSystemStatus("request_received");
        setWorkflowStatus({
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
      const validationPassed = nextSafetyReport.overall === "PASSED";
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
      setSourceMode("manual_upload");
      setErrors([]);
      setPlaybackState("idle");
      setElapsedSeconds(0);
      setYoutubeFallbackActive(false);
      setSystemStatus(validationPassed ? "validated" : "schedule_generated");
      setWorkflowStatus({
        requestReceived: true,
        libraryChecked: false,
        songFound: null,
        scheduleGenerated: true,
        validationPassed,
        readyForSimulation: validationPassed,
      });
    } catch (error) {
      setSchedule(null);
      setSafetyReport(null);
      setSourceLabel(uploadedFileName);
      setSourceMode("manual_upload");
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
        setSystemStatus("stopped");
        setActiveCommandIds(new Set());
        setActiveInstrumentIds(new Set());
      },
    });
    engineRef.current = engine;
    setPlaybackState("playing");
    setSystemStatus("playing");
    engine.play(elapsedSeconds >= totalDuration ? 0 : elapsedSeconds);
  }

  function pausePlayback() {
    if (!engineRef.current || playbackState !== "playing") {
      return;
    }
    setElapsedSeconds(engineRef.current.pause());
    setPlaybackState("paused");
    setSystemStatus("stopped");
  }

  function stopPlayback() {
    engineRef.current?.stop();
    engineRef.current = null;
    setPlaybackState("stopped");
    setElapsedSeconds(0);
    setActiveCommandIds(new Set());
    setActiveInstrumentIds(new Set());
    setSystemStatus((current) => (current === "playing" ? "stopped" : current));
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

  const value: AngklungSystemContextValue = {
    activeCommandIds,
    activeInstrumentIds,
    chatInput,
    chatMessages,
    elapsedSeconds,
    errors,
    generatedNotes,
    instruments,
    latestUserRequest,
    playbackState,
    safetyReport,
    schedule,
    selectedSong,
    selectedSongId,
    settings,
    sourceLabel,
    sourceMode,
    supportedSongs: BUILT_IN_SONGS,
    systemStatus,
    totalDuration,
    workflowStatus,
    youtubeFallbackActive,
    youtubeUrl,
    generateBuiltInSchedule,
    loadSchedule,
    pausePlayback,
    playSchedule,
    requestSong,
    resetPlayback,
    setChatInput,
    setSelectedSongId,
    setSettings,
    setYoutubeUrl,
    stopPlayback,
  };

  return (
    <AngklungSystemContext.Provider value={value}>
      <div className="min-h-screen">
        <SystemNavigation pathname={pathname} status={systemStatus} />
        {children}
      </div>
    </AngklungSystemContext.Provider>
  );
}

export function useAngklungSystem(): AngklungSystemContextValue {
  const context = useContext(AngklungSystemContext);
  if (!context) {
    throw new Error("useAngklungSystem must be used inside AngklungSystemProvider.");
  }
  return context;
}

export function displaySongTitle(title: string): string {
  return title.replace(/\s+[^a-zA-Z0-9\s]+?\s+Layered Angklung$/, "");
}

function SystemNavigation({ pathname, status }: { pathname: string; status: SystemStatus }) {
  const modeLabel = pathname.startsWith("/control") ? "Operator-facing system monitor and simulator" : "Visitor-facing song request screen";

  return (
    <header className="border-b border-white/10 bg-black/55 px-5 py-4 shadow-[0_18px_60px_rgba(0,0,0,0.35)] backdrop-blur-xl lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-300">{modeLabel}</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-50">AI Angklung Performance System</h1>
        </div>
        <nav className="flex flex-wrap items-center gap-2">
          <NavLink active={pathname.startsWith("/guest")} href="/guest" label="Guest Interface" />
          <NavLink active={pathname.startsWith("/control")} href="/control" label="Control Panel" />
          <span className="rounded border border-emerald-400/30 bg-emerald-400/10 px-3 py-2 text-sm font-semibold text-emerald-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
            {formatSystemStatus(status)}
          </span>
        </nav>
      </div>
    </header>
  );
}

function NavLink({ active, href, label }: { active: boolean; href: string; label: string }) {
  return (
    <Link
      className={`rounded border px-3 py-2 text-sm font-semibold ${
        active
          ? "border-amber-300/70 bg-amber-300 text-slate-950 shadow-[0_0_24px_rgba(251,191,36,0.22)]"
          : "border-white/10 bg-white/5 text-slate-200 hover:border-amber-300/60 hover:text-amber-100"
      }`}
      href={href}
    >
      {label}
    </Link>
  );
}

function formatSystemStatus(status: SystemStatus): string {
  const labels: Record<SystemStatus, string> = {
    idle: "Idle",
    request_received: "Request received",
    schedule_generated: "Schedule generated",
    validated: "Validated",
    playing: "Playing",
    stopped: "Stopped",
    unsupported: "Unsupported",
  };
  return labels[status];
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

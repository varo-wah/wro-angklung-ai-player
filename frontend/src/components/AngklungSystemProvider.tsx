"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AudioEngine } from "@/lib/audioEngine";
import {
  normalizeAiSongRequestResult,
  toAiCatalogEntry,
  type AiAssistantMode,
  type AiConversationState,
  type AiPreRouterDecision,
  type AiSongRequestIntent,
  type AiSongRequestResult,
} from "@/lib/aiSongRequest";
import { createLocalFallbackSongRequestResult } from "@/lib/ai/localFallbackMatcher";
import { buildFullAngklungRack } from "@/lib/instrumentMap";
import { PlaybackEngine } from "@/lib/playbackEngine";
import { routePlaybackChatCommand, type PlaybackChatCommand } from "@/lib/playbackCommandRouter";
import { type ArrangementSettings, buildScheduleFromBuiltInSong, scaleNotes } from "@/lib/scheduleBuilder";
import { type SafetyReport, validateMotorSafety } from "@/lib/safetyValidator";
import { validateSchedulePayload } from "@/lib/scheduleValidator";
import { getActiveCatalogSongs, getVisibleCatalogSongs, loadSongCatalog } from "@/lib/songCatalog";
import { loadSongArrangement } from "@/lib/songLoader";
import type { LoadedSong, SongCatalogEntry, SongNote } from "@/lib/songTypes";
import {
  createSyncTabId,
  createSystemSyncController,
  readStoredSystemSnapshot,
  SYSTEM_SYNC_LIBRARY_VERSION,
  type SyncedSystemSnapshot,
} from "@/lib/systemSync";
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

type SyncState = {
  available: boolean;
  lastSyncedAt: number | null;
  status: "waiting" | "synced" | "local_only";
};

type AngklungSystemContextValue = {
  activeCommandIds: Set<string>;
  activeInstrumentIds: Set<string>;
  aiAssistantMode: AiAssistantMode;
  aiConfidence: number;
  aiIntent: AiSongRequestIntent;
  aiKnowledgeSections: string[];
  aiMatchedSongId: string | null;
  aiNeedsOperatorReview: boolean;
  aiConversationState: AiConversationState;
  aiPendingSongId: string | null;
  aiPreRouterDecision: AiPreRouterDecision | null;
  aiRawProviderResult: string | null;
  aiFallbackReason: string | null;
  aiLastUnsupportedRequest: string | null;
  aiShouldSearchCatalog: boolean;
  aiSuggestedSongIds: string[];
  chatInput: string;
  chatMessages: ChatMessage[];
  elapsedSeconds: number;
  emergencyStopPlayback: () => void;
  errors: string[];
  generatedNotes: SongNote[];
  instruments: RackInstrument[];
  latestUserRequest: string;
  playbackState: PlaybackState;
  safetyReport: SafetyReport | null;
  schedule: ActuatorSchedule | null;
  selectedSong: LoadedSong;
  selectedSongId: string;
  settings: ArrangementSettings;
  sourceLabel: string;
  sourceMode: SourceMode;
  supportedSongs: SongCatalogEntry[];
  systemStatus: SystemStatus;
  totalDuration: number;
  workflowStatus: WorkflowStatus;
  youtubeFallbackActive: boolean;
  youtubeUrl: string;
  generateBuiltInSchedule: () => void;
  loadSchedule: (fileText: string, uploadedFileName: string) => void;
  pausePlayback: () => void;
  playSchedule: () => Promise<void>;
  refreshAiAssistant: () => Promise<void>;
  requestSong: (request: string) => Promise<string | null>;
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
    text: "Hi, I am Angklobot. Ask me about the robot, angklung, or a song you would like to hear.",
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

const EMPTY_SELECTED_SONG: LoadedSong = {
  id: "",
  title: "Loading song catalog",
  aliases: [],
  arrangement_status: "not_loaded",
  demo_safe: false,
  has_validated_notes: false,
  active: false,
  physical_rack_map: "G3-C6",
  playable: false,
  tempo_bpm: 120,
  time_signature: "4/4",
  notes: [],
};

const AngklungSystemContext = createContext<AngklungSystemContextValue | null>(null);

export function AngklungSystemProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [songCatalog, setSongCatalog] = useState<SongCatalogEntry[]>([]);
  const [selectedSongId, setSelectedSongIdState] = useState("");
  const [selectedSong, setSelectedSong] = useState<LoadedSong>(EMPTY_SELECTED_SONG);
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [settings, setSettings] = useState<ArrangementSettings>(DEFAULT_SETTINGS);
  const [schedule, setSchedule] = useState<ActuatorSchedule | null>(null);
  const [generatedNotes, setGeneratedNotes] = useState<SongNote[]>([]);
  const [sourceLabel, setSourceLabel] = useState<string>("Loading song catalog");
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
  const [aiAssistantMode, setAiAssistantMode] = useState<AiAssistantMode>("local_fallback");
  const [aiConfidence, setAiConfidence] = useState(0);
  const [aiIntent, setAiIntent] = useState<AiSongRequestIntent>("unknown");
  const [aiKnowledgeSections, setAiKnowledgeSections] = useState<string[]>([]);
  const [aiMatchedSongId, setAiMatchedSongId] = useState<string | null>(null);
  const [aiNeedsOperatorReview, setAiNeedsOperatorReview] = useState(false);
  const [aiConversationState, setAiConversationState] = useState<AiConversationState>("idle");
  const [aiPendingSongId, setAiPendingSongId] = useState<string | null>(null);
  const [aiPreRouterDecision, setAiPreRouterDecision] = useState<AiPreRouterDecision | null>(null);
  const [aiRawProviderResult, setAiRawProviderResult] = useState<string | null>(null);
  const [aiFallbackReason, setAiFallbackReason] = useState<string | null>(null);
  const [aiLastUnsupportedRequest, setAiLastUnsupportedRequest] = useState<string | null>(null);
  const [aiShouldSearchCatalog, setAiShouldSearchCatalog] = useState(false);
  const [aiSuggestedSongIds, setAiSuggestedSongIds] = useState<string[]>([]);
  const [systemStatus, setSystemStatus] = useState<SystemStatus>("idle");
  const [syncState, setSyncState] = useState<SyncState>({
    available: false,
    lastSyncedAt: null,
    status: "waiting",
  });
  const engineRef = useRef<PlaybackEngine | null>(null);
  const audioRef = useRef<AudioEngine | null>(null);
  const applyingSyncedSnapshotRef = useRef(false);
  const lastPublishedAtRef = useRef(0);
  const latestSnapshotAtRef = useRef(0);
  const syncControllerRef = useRef<ReturnType<typeof createSystemSyncController> | null>(null);
  const tabIdRef = useRef(createSyncTabId());
  const songCatalogRef = useRef<SongCatalogEntry[]>([]);
  const loadedSongsRef = useRef(new Map<string, LoadedSong>());
  const hasCheckedAiProviderRef = useRef(false);
  const playbackSessionRef = useRef(0);
  const activeCommandTimeoutsRef = useRef(new Set<number>());

  const supportedSongs = useMemo(() => getVisibleCatalogSongs(songCatalog), [songCatalog]);
  const instruments = useMemo(() => buildFullAngklungRack(), []);
  const totalDuration = schedule?.timing.total_duration_seconds ?? 0;

  useEffect(() => {
    let cancelled = false;

    async function loadCatalog() {
      try {
        const catalog = await loadSongCatalog();
        if (cancelled) {
          return;
        }
        songCatalogRef.current = catalog;
        setSongCatalog(catalog);
        const activeSongs = getActiveCatalogSongs(catalog);
        if (activeSongs.length === 0) {
          setErrors(["Song catalog failed to load"]);
          setSourceLabel("Song catalog failed to load");
          return;
        }

        const storedSelectedId = readStoredSystemSnapshot()?.selectedSongId;
        const candidateSelectedId = selectedSongId || storedSelectedId;
        const nextSelectedId = candidateSelectedId && activeSongs.some((song) => song.id === candidateSelectedId) ? candidateSelectedId : activeSongs[0].id;
        setSelectedSongIdState(nextSelectedId);
        void loadSelectedSong(nextSelectedId, catalog);
      } catch (error) {
        if (cancelled) {
          return;
        }
        setErrors([error instanceof Error ? error.message : "Song catalog failed to load"]);
        setSourceLabel("Song catalog failed to load");
      }
    }

    void loadCatalog();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const storedSnapshot = readStoredSystemSnapshot();
    if (storedSnapshot) {
      applySyncedSnapshot(storedSnapshot);
    }

    const controller = createSystemSyncController(tabIdRef.current, applySyncedSnapshot);
    const syncAvailable = controller.broadcastAvailable || controller.storageAvailable;
    syncControllerRef.current = controller;
    setSyncState((current) => ({
      available: syncAvailable,
      lastSyncedAt: storedSnapshot?.updatedAt ?? current.lastSyncedAt,
      status: syncAvailable ? "synced" : "local_only",
    }));

    return () => {
      controller.close();
      syncControllerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (songCatalog.length === 0 || hasCheckedAiProviderRef.current) {
      return;
    }

    hasCheckedAiProviderRef.current = true;
    void probeAiAssistant(songCatalog.map(toAiCatalogEntry))
      .then((result) => {
        setAiAssistantMode(result.provider);
        setAiFallbackReason(result.fallback_reason ?? null);
      })
      .catch((error) => {
        setAiAssistantMode("local_fallback");
        setAiFallbackReason(error instanceof Error ? error.message : "AI provider check failed");
      });
  }, [songCatalog]);

  useEffect(() => {
    if (!syncControllerRef.current) {
      return;
    }

    if (applyingSyncedSnapshotRef.current) {
      applyingSyncedSnapshotRef.current = false;
      return;
    }

    const now = Date.now();
    if (playbackState === "playing" && now - lastPublishedAtRef.current < 250) {
      return;
    }

    const snapshot = createSnapshot(now);
    latestSnapshotAtRef.current = snapshot.updatedAt;
    lastPublishedAtRef.current = snapshot.updatedAt;
    syncControllerRef.current.publish(snapshot);
    setSyncState((current) => ({
      ...current,
      lastSyncedAt: snapshot.updatedAt,
      status: current.available ? "synced" : "local_only",
    }));
  }, [
    activeCommandIds,
    activeInstrumentIds,
    aiAssistantMode,
    aiConfidence,
    aiConversationState,
    aiFallbackReason,
    aiLastUnsupportedRequest,
    aiIntent,
    aiKnowledgeSections,
    aiMatchedSongId,
    aiNeedsOperatorReview,
    aiPendingSongId,
    aiPreRouterDecision,
    aiRawProviderResult,
    aiShouldSearchCatalog,
    aiSuggestedSongIds,
    chatMessages,
    elapsedSeconds,
    generatedNotes,
    latestUserRequest,
    playbackState,
    safetyReport,
    schedule,
    selectedSongId,
    sourceLabel,
    sourceMode,
    systemStatus,
    workflowStatus,
    youtubeFallbackActive,
  ]);

  function createSnapshot(updatedAt: number): SyncedSystemSnapshot {
    return {
      activeCommandIds: Array.from(activeCommandIds),
      activeInstrumentIds: Array.from(activeInstrumentIds),
      aiAssistantMode,
      aiConfidence,
      aiIntent,
      aiKnowledgeSections,
      aiMatchedSongId,
      aiNeedsOperatorReview,
      aiConversationState,
      aiPendingSongId,
      aiPreRouterDecision,
      aiRawProviderResult,
      aiFallbackReason,
      aiLastUnsupportedRequest,
      aiShouldSearchCatalog,
      aiSuggestedSongIds,
      chatMessages,
      elapsedSeconds,
      generatedNotes,
      latestUserRequest,
      libraryVersion: SYSTEM_SYNC_LIBRARY_VERSION,
      playbackState,
      safetyReport,
      schedule,
      selectedSongId,
      sourceLabel,
      sourceMode,
      sourceTabId: tabIdRef.current,
      systemStatus,
      updatedAt,
      workflowStatus,
      youtubeFallbackActive,
    };
  }

  function applySyncedSnapshot(snapshot: SyncedSystemSnapshot) {
    if (snapshot.updatedAt <= latestSnapshotAtRef.current) {
      return;
    }
    const activeSongs = getActiveCatalogSongs(songCatalogRef.current);
    if (snapshot.sourceMode === "library" && activeSongs.length > 0 && !activeSongs.some((song) => song.id === snapshot.selectedSongId)) {
      return;
    }

    applyingSyncedSnapshotRef.current = true;
    latestSnapshotAtRef.current = snapshot.updatedAt;
    playbackSessionRef.current += 1;
    engineRef.current?.stop();
    engineRef.current = null;
    audioRef.current?.stopAll();
    clearActiveCommandTimeouts();

    setActiveCommandIds(new Set(snapshot.activeCommandIds));
    setActiveInstrumentIds(new Set(snapshot.activeInstrumentIds));
    setAiAssistantMode(snapshot.aiAssistantMode);
    setAiConfidence(snapshot.aiConfidence);
    setAiIntent(snapshot.aiIntent);
    setAiKnowledgeSections(snapshot.aiKnowledgeSections);
    setAiMatchedSongId(snapshot.aiMatchedSongId);
    setAiNeedsOperatorReview(snapshot.aiNeedsOperatorReview);
    setAiConversationState(snapshot.aiConversationState);
    setAiPendingSongId(snapshot.aiPendingSongId);
    setAiPreRouterDecision(snapshot.aiPreRouterDecision);
    setAiRawProviderResult(snapshot.aiRawProviderResult);
    setAiFallbackReason(snapshot.aiFallbackReason);
    setAiLastUnsupportedRequest(snapshot.aiLastUnsupportedRequest);
    setAiShouldSearchCatalog(snapshot.aiShouldSearchCatalog);
    setAiSuggestedSongIds(snapshot.aiSuggestedSongIds);
    setChatMessages(snapshot.chatMessages.length > 0 ? snapshot.chatMessages : INITIAL_CHAT_MESSAGES);
    setElapsedSeconds(snapshot.elapsedSeconds);
    setErrors([]);
    setGeneratedNotes(snapshot.generatedNotes);
    setLatestUserRequest(snapshot.latestUserRequest);
    setPlaybackState(snapshot.playbackState);
    setSafetyReport(snapshot.safetyReport);
    setSchedule(snapshot.schedule);
    setSelectedSongIdState(snapshot.selectedSongId);
    if (snapshot.selectedSongId) {
      void loadSelectedSong(snapshot.selectedSongId);
    }
    setSourceLabel(snapshot.sourceLabel);
    setSourceMode(snapshot.sourceMode);
    setSystemStatus(snapshot.systemStatus);
    setWorkflowStatus(snapshot.workflowStatus);
    setYoutubeFallbackActive(snapshot.youtubeFallbackActive);
    setSyncState((current) => ({
      ...current,
      lastSyncedAt: snapshot.updatedAt,
      status: current.available ? "synced" : "local_only",
    }));
  }

  async function loadSelectedSong(songId: string, catalogOverride?: SongCatalogEntry[]): Promise<LoadedSong | null> {
    const catalog = catalogOverride ?? songCatalogRef.current;
    const catalogEntry = getActiveCatalogSongs(catalog).find((song) => song.id === songId);
    if (!catalogEntry) {
      setErrors(["Arrangement file failed to load"]);
      return null;
    }

    const cachedSong = loadedSongsRef.current.get(catalogEntry.id);
    if (cachedSong) {
      setSelectedSong(cachedSong);
      setSourceLabel(cachedSong.title);
      return cachedSong;
    }

    try {
      const loadedSong = await loadSongArrangement(catalogEntry);
      loadedSongsRef.current.set(catalogEntry.id, loadedSong);
      setSelectedSong(loadedSong);
      setSourceLabel(loadedSong.title);
      setErrors((current) => current.filter((error) => error !== "Arrangement file failed to load"));
      return loadedSong;
    } catch (error) {
      setErrors([error instanceof Error ? error.message : "Arrangement file failed to load"]);
      setSourceLabel("Arrangement file failed to load");
      return null;
    }
  }

  function setSelectedSongId(songId: string) {
    setSelectedSongIdState(songId);
    void loadSelectedSong(songId);
  }

  function generateScheduleForSong(song: LoadedSong): SafetyReport | null {
    stopPlaybackMedia();
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
    void generateSelectedSongSchedule();
  }

  async function generateSelectedSongSchedule(): Promise<SafetyReport | null> {
    const playbackSession = playbackSessionRef.current;
    const loadedSong = selectedSong.id === selectedSongId && selectedSong.notes.length > 0 ? selectedSong : await loadSelectedSong(selectedSongId);
    if (!loadedSong || playbackSession !== playbackSessionRef.current) {
      return null;
    }

    setLatestUserRequest(loadedSong.title);
    return generateScheduleForSong(loadedSong);
  }

  function requestSong(request: string): Promise<string | null> {
    return handleSongRequest(request);
  }

  async function handleSongRequest(request: string): Promise<string | null> {
    const trimmedRequest = request.trim();
    if (!trimmedRequest) {
      return null;
    }

    const playbackCommand = routePlaybackChatCommand(trimmedRequest);
    if (playbackCommand) {
      const playbackResponse = handlePlaybackChatCommand(playbackCommand, trimmedRequest);
      if (playbackResponse) {
        return playbackResponse;
      }
    }

    const playbackSession = playbackSessionRef.current;

    const timestamp = Date.now();
    const openingMessages: ChatMessage[] = [{ id: timestamp, speaker: "user", text: trimmedRequest }];

    setChatInput("");
    setLatestUserRequest(trimmedRequest);
    setSystemStatus("request_received");
    setChatMessages((current) => [...current, ...openingMessages]);
    setWorkflowStatus({
      requestReceived: true,
      libraryChecked: false,
      songFound: null,
      scheduleGenerated: false,
      validationPassed: false,
      readyForSimulation: false,
    });

    const aiResult = await requestAiSongInterpretation(trimmedRequest);
    if (playbackSession !== playbackSessionRef.current) {
      return null;
    }
    const matchedCatalogEntry = aiResult.matched_song_id
      ? getVisibleCatalogSongs(songCatalogRef.current).find((song) => song.id === aiResult.matched_song_id) ?? null
      : null;

    applyAiResult(aiResult);
    const libraryWasChecked = shouldShowLibraryCheck(aiResult);
    setWorkflowStatus((current) => ({
      ...current,
      libraryChecked: libraryWasChecked,
      songFound: Boolean(matchedCatalogEntry),
    }));
    const responseMessages: ChatMessage[] = [
      ...(libraryWasChecked ? [{ id: timestamp + 1, speaker: "assistant" as const, text: "Checking the supported song library..." }] : []),
      { id: timestamp + 2, speaker: "assistant", text: aiResult.assistant_message },
    ];
    setChatMessages((current) => [...current, ...responseMessages]);

    if (!aiResult.should_generate_schedule || !matchedCatalogEntry) {
      if (isPassiveConversationIntent(aiResult.intent)) {
        setYoutubeFallbackActive(false);
        setSourceMode("library");
        setErrors([]);
        setSystemStatus("idle");
        return aiResult.speech_text;
      }

      stopPlaybackMedia();
      const unsupported = aiResult.intent === "unsupported_song";
      setYoutubeFallbackActive(unsupported);
      setSourceMode(unsupported ? "youtube_placeholder" : "library");
      setSchedule(null);
      setGeneratedNotes([]);
      setSourceLabel(unsupported ? "Unsupported song request" : "Awaiting guest confirmation");
      setErrors([]);
      setSafetyReport(null);
      setSystemStatus(unsupported ? "unsupported" : "idle");
      return aiResult.speech_text;
    }

    setSelectedSongIdState(matchedCatalogEntry.id);
    const matchedSong = await loadSelectedSong(matchedCatalogEntry.id);
    if (playbackSession !== playbackSessionRef.current) {
      return null;
    }
    if (!matchedSong) {
      setChatMessages((current) => [
        ...current,
        {
          id: timestamp + 3,
          speaker: "assistant",
          text: "Arrangement file failed to load.",
        },
        {
          id: timestamp + 4,
          speaker: "assistant",
          text: "This arrangement is not playable yet. The operator should review the Control Panel.",
        },
      ]);
      return "This arrangement is not playable yet. The operator should review the Control Panel.";
    }

    const report = generateScheduleForSong(matchedSong);
    const hasWarnings = Boolean(report?.checks.some((check) => check.status === "warning"));
    const isDraftArrangement =
      matchedSong.arrangement_status === "draft_from_midi_needs_simplification" ||
      matchedSong.arrangement_status === "draft_layered_from_midi_needs_simplification" ||
      matchedSong.arrangement_status === "draft_layered_from_midi_lower_pitch_needs_review" ||
      matchedSong.arrangement_status === "draft_layered_from_midi_g3_c6_upper_melody_needs_review" ||
      matchedSong.arrangement_status === "draft_layered_from_midi_g3_c6_lower_pitch_needs_review" ||
      matchedSong.demo_safe === false;
    const finalResponse =
      report?.overall === "PASSED" && hasWarnings
        ? "This draft arrangement has warnings. The operator should review the Control Panel before demo use."
        : report?.overall === "PASSED"
          ? isDraftArrangement
            ? "Validation passed. Ready to test playback."
            : "Validation passed. Ready to play."
          : "This arrangement is not playable yet. The operator should review the Control Panel.";
    setChatMessages((current) => [
      ...current,
      {
        id: timestamp + 3,
        speaker: "assistant",
        text: "Generating the angklung schedule...",
      },
      {
        id: timestamp + 4,
        speaker: "assistant",
        text: finalResponse,
      },
    ]);
    return finalResponse;
  }

  function handlePlaybackChatCommand(command: PlaybackChatCommand, request: string): string | null {
    if (command === "resume" && (!schedule || (playbackState !== "paused" && playbackState !== "stopped"))) {
      return null;
    }

    const timestamp = Date.now();
    setChatInput("");
    setLatestUserRequest(request);
    setChatMessages((current) => [...current, { id: timestamp, speaker: "user", text: request }]);

    if (command === "stop") {
      emergencyStopPlayback();
      setChatMessages((current) => [...current, { id: timestamp + 1, speaker: "assistant", text: "Stopped playback." }]);
      return "Stopped playback.";
    }

    if (command === "pause") {
      pausePlayback();
      setChatMessages((current) => [...current, { id: timestamp + 1, speaker: "assistant", text: "Paused playback." }]);
      return "Paused playback.";
    }

    setChatMessages((current) => [...current, { id: timestamp + 1, speaker: "assistant", text: "Resuming playback." }]);
    void playSchedule();
    return "Resuming playback.";
  }

  async function requestAiSongInterpretation(message: string): Promise<AiSongRequestResult> {
    const catalog = songCatalogRef.current.map(toAiCatalogEntry);
    const pendingSongTitle = aiPendingSongId ? getVisibleCatalogSongs(songCatalogRef.current).find((song) => song.id === aiPendingSongId)?.title ?? null : null;
    try {
      const response = await fetch("/api/ai/song-request", {
        body: JSON.stringify({
          catalog,
          context: {
            conversation_state: aiConversationState,
            last_unsupported_request: aiLastUnsupportedRequest,
            pending_song_id: aiPendingSongId,
            pending_song_title: pendingSongTitle,
            recent_messages: chatMessages.slice(-6).map((chatMessage) => ({
              speaker: chatMessage.speaker,
              text: chatMessage.text,
            })),
          },
          message,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      if (!response.ok) {
        throw new Error("AI route unavailable");
      }
      const payload = (await response.json()) as Partial<AiSongRequestResult>;
      const normalized = normalizeAiSongRequestResult(payload, catalog, payload.provider ?? "local_fallback", payload.fallback_reason, {
        conversation_state: aiConversationState,
        last_unsupported_request: aiLastUnsupportedRequest,
        pending_song_id: aiPendingSongId,
        pending_song_title: pendingSongTitle,
      });
      if (!normalized) {
        throw new Error("AI route returned invalid JSON");
      }
      return normalized;
    } catch {
      return createLocalFallbackSongRequestResult(
        message,
        catalog,
        {
          conversation_state: aiConversationState,
          last_unsupported_request: aiLastUnsupportedRequest,
          pending_song_id: aiPendingSongId,
          pending_song_title: pendingSongTitle,
          recent_messages: chatMessages.slice(-6).map((chatMessage) => ({
            speaker: chatMessage.speaker,
            text: chatMessage.text,
          })),
        },
        "AI route unavailable.",
      );
    }
  }

  async function refreshAiAssistant(): Promise<void> {
    const catalog = songCatalogRef.current.map(toAiCatalogEntry);
    setChatInput("");
    setChatMessages(INITIAL_CHAT_MESSAGES);
    setLatestUserRequest("");

    try {
      applyAiResult(await probeAiAssistant(catalog));
    } catch (error) {
      const reason = error instanceof Error ? error.message : "AI refresh failed";
      applyAiResult(createLocalFallbackSongRequestResult("Hello", catalog, {}, reason));
    }
  }

  async function probeAiAssistant(catalog: ReturnType<typeof toAiCatalogEntry>[]): Promise<AiSongRequestResult> {
    const response = await fetch("/api/ai/song-request", {
      body: JSON.stringify({
        catalog,
        context: {
          conversation_state: "idle",
          last_unsupported_request: null,
          pending_song_id: null,
          pending_song_title: null,
          recent_messages: [],
        },
        message: "Hello",
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    if (!response.ok) {
      throw new Error(`AI provider check failed with HTTP ${response.status}`);
    }

    const payload = (await response.json()) as Partial<AiSongRequestResult>;
    const normalized = normalizeAiSongRequestResult(payload, catalog, payload.provider ?? "local_fallback", payload.fallback_reason, {
      conversation_state: "idle",
      last_unsupported_request: null,
      pending_song_id: null,
      pending_song_title: null,
    });
    if (!normalized) {
      throw new Error("AI provider check returned invalid JSON");
    }
    return normalized;
  }

  function applyAiResult(result: AiSongRequestResult) {
    setAiAssistantMode(result.provider);
    setAiConfidence(result.confidence);
    setAiConversationState(result.next_state);
    setAiFallbackReason(result.fallback_reason ?? null);
    setAiIntent(result.intent);
    setAiKnowledgeSections(result.knowledge_sections);
    setAiLastUnsupportedRequest(result.last_unsupported_request);
    setAiMatchedSongId(result.matched_song_id);
    setAiNeedsOperatorReview(result.needs_operator_review);
    setAiPendingSongId(result.needs_confirmation ? result.matched_song_id : null);
    setAiPreRouterDecision(result.pre_router_decision);
    setAiRawProviderResult(result.raw_provider_result);
    setAiShouldSearchCatalog(result.should_search_catalog);
    setAiSuggestedSongIds(result.suggested_song_ids);
  }

  function shouldShowLibraryCheck(result: AiSongRequestResult): boolean {
    return result.should_search_catalog;
  }

  function isPassiveConversationIntent(intent: AiSongRequestIntent): boolean {
    return (
      intent === "greeting" ||
      intent === "general_chat" ||
      intent === "question_about_machine" ||
      intent === "question_about_angklung" ||
      intent === "ask_capabilities" ||
      intent === "list_songs" ||
      intent === "confirmation_no" ||
      intent === "explain_limitation" ||
      intent === "smalltalk" ||
      intent === "unknown"
    );
  }

  function loadSchedule(fileText: string, uploadedFileName: string) {
    stopPlaybackMedia();
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

    const playbackSession = playbackSessionRef.current + 1;
    playbackSessionRef.current = playbackSession;

    audioRef.current ??= new AudioEngine();
    try {
      await audioRef.current.ensureReady();
      if (playbackSession !== playbackSessionRef.current) {
        return;
      }
      setErrors([]);
    } catch (error) {
      if (playbackSession !== playbackSessionRef.current) {
        return;
      }
      setErrors([error instanceof Error ? error.message : "Audio could not start. Check browser audio permissions and output volume."]);
      return;
    }

    if (playbackSession !== playbackSessionRef.current) {
      return;
    }

    engineRef.current?.stop();
    const engine = new PlaybackEngine(schedule.commands, totalDuration, {
      onCommand: (command) => {
        if (playbackSession === playbackSessionRef.current) triggerCommand(command);
      },
      onTimeUpdate: (elapsed) => {
        if (playbackSession === playbackSessionRef.current) setElapsedSeconds(elapsed);
      },
      onComplete: () => {
        if (playbackSession !== playbackSessionRef.current) return;
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
    playbackSessionRef.current += 1;
    if (engineRef.current && playbackState === "playing") {
      setElapsedSeconds(engineRef.current.pause());
    }
    audioRef.current?.stopAll();
    clearActiveCommandTimeouts();
    setActiveCommandIds(new Set());
    setActiveInstrumentIds(new Set());
    setPlaybackState("paused");
    setSystemStatus("stopped");
  }

  function stopPlayback() {
    emergencyStopPlayback();
  }

  function emergencyStopPlayback() {
    stopPlaybackMedia();
    setAiConversationState("awaiting_song");
    setAiPendingSongId(null);
  }

  function stopPlaybackMedia() {
    playbackSessionRef.current += 1;
    engineRef.current?.stop();
    engineRef.current = null;
    audioRef.current?.stopAll();
    clearActiveCommandTimeouts();
    setPlaybackState("stopped");
    setElapsedSeconds(0);
    setActiveCommandIds(new Set());
    setActiveInstrumentIds(new Set());
    setSystemStatus("stopped");
  }

  function resetPlayback() {
    stopPlayback();
    setPlaybackState("idle");
  }

  function triggerCommand(command: ActuatorCommand) {
    try {
      audioRef.current?.playNote(command.note, command.duration_seconds, command.strength);
    } catch (error) {
      setErrors([error instanceof Error ? error.message : "Audio playback failed. Check browser audio permissions and output volume."]);
    }
    setActiveCommandIds((current) => new Set(current).add(command.command_id));
    setActiveInstrumentIds((current) => new Set(current).add(command.instrument_id));

    const timeoutId = window.setTimeout(() => {
      activeCommandTimeoutsRef.current.delete(timeoutId);
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
    activeCommandTimeoutsRef.current.add(timeoutId);
  }

  function clearActiveCommandTimeouts() {
    for (const timeoutId of activeCommandTimeoutsRef.current) {
      window.clearTimeout(timeoutId);
    }
    activeCommandTimeoutsRef.current.clear();
  }

  const value: AngklungSystemContextValue = {
    activeCommandIds,
    activeInstrumentIds,
    aiAssistantMode,
    aiConfidence,
    aiConversationState,
    aiFallbackReason,
    aiLastUnsupportedRequest,
    aiIntent,
    aiKnowledgeSections,
    aiMatchedSongId,
    aiNeedsOperatorReview,
    aiPendingSongId,
    aiPreRouterDecision,
    aiRawProviderResult,
    aiShouldSearchCatalog,
    aiSuggestedSongIds,
    chatInput,
    chatMessages,
    elapsedSeconds,
    emergencyStopPlayback,
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
    supportedSongs,
    systemStatus,
    totalDuration,
    workflowStatus,
    youtubeFallbackActive,
    youtubeUrl,
    generateBuiltInSchedule,
    loadSchedule,
    pausePlayback,
    playSchedule,
    refreshAiAssistant,
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
        <SystemNavigation pathname={pathname} status={systemStatus} syncState={syncState} />
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

function SystemNavigation({ pathname, status, syncState }: { pathname: string; status: SystemStatus; syncState: SyncState }) {
  const modeLabel = pathname.startsWith("/control")
    ? "Operator-facing system monitor and simulator"
    : pathname.startsWith("/display")
      ? "Audience-facing stage display"
      : "Visitor-facing song request screen";

  return (
    <header className="border-b border-white/10 bg-black/55 px-5 py-4 shadow-[0_18px_60px_rgba(0,0,0,0.35)] backdrop-blur-xl lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-lime-300">{modeLabel}</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-50">AI Angklung Performance System</h1>
        </div>
        <nav className="flex flex-wrap items-center gap-2">
          <NavLink active={pathname.startsWith("/guest")} href="/guest" label="Guest Interface" />
          <NavLink active={pathname.startsWith("/control")} href="/control" label="Control Panel" />
          <NavLink active={pathname.startsWith("/display")} href="/display" label="Display Screen" />
          <span className="rounded border border-white/10 bg-white/5 px-3 py-2 text-sm font-semibold text-slate-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
            {formatSyncState(syncState)}
          </span>
          <span className="rounded border border-emerald-400/30 bg-emerald-400/10 px-3 py-2 text-sm font-semibold text-emerald-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
            {formatSystemStatus(status)}
          </span>
        </nav>
      </div>
    </header>
  );
}

function formatSyncState(syncState: SyncState): string {
  if (syncState.status === "waiting") {
    return "Waiting for sync";
  }
  if (syncState.status === "local_only") {
    return "Local only";
  }
  if (!syncState.lastSyncedAt) {
    return "Synced across screens";
  }
  const ageSeconds = Math.max(0, Math.round((Date.now() - syncState.lastSyncedAt) / 1000));
  return ageSeconds <= 1 ? "Synced across screens" : `Last sync: ${ageSeconds}s ago`;
}

function NavLink({ active, href, label }: { active: boolean; href: string; label: string }) {
  return (
    <Link
      className={`rounded border px-3 py-2 text-sm font-semibold ${
        active
          ? "border-lime-300/70 bg-lime-300 text-slate-950 shadow-[0_0_24px_rgba(132,204,22,0.22)]"
          : "border-white/10 bg-white/5 text-slate-200 hover:border-lime-300/60 hover:text-lime-100"
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

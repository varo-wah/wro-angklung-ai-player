"use client";

import { useMemo, useRef, useState } from "react";
import { AngklungRack } from "@/components/AngklungRack";
import { PlaybackControls } from "@/components/PlaybackControls";
import { ScheduleJsonViewer } from "@/components/ScheduleJsonViewer";
import { ScheduleUploader } from "@/components/ScheduleUploader";
import { TimelineView } from "@/components/TimelineView";
import { AudioEngine } from "@/lib/audioEngine";
import { PlaybackEngine } from "@/lib/playbackEngine";
import { validateSchedulePayload } from "@/lib/scheduleValidator";
import type { ActuatorCommand, ActuatorSchedule, PlaybackState, RackInstrument } from "@/lib/types";

export default function Home() {
  const [schedule, setSchedule] = useState<ActuatorSchedule | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [errors, setErrors] = useState<string[]>([]);
  const [playbackState, setPlaybackState] = useState<PlaybackState>("idle");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [activeCommandIds, setActiveCommandIds] = useState<Set<string>>(new Set());
  const [activeInstrumentIds, setActiveInstrumentIds] = useState<Set<string>>(new Set());
  const engineRef = useRef<PlaybackEngine | null>(null);
  const audioRef = useRef<AudioEngine | null>(null);

  const instruments = useMemo(() => buildRackInstruments(schedule?.commands ?? []), [schedule]);
  const totalDuration = schedule?.timing.total_duration_seconds ?? 0;

  function loadSchedule(fileText: string, uploadedFileName: string) {
    stopPlayback();
    try {
      const parsed = JSON.parse(fileText) as unknown;
      const result = validateSchedulePayload(parsed);
      if (!result.ok) {
        setSchedule(null);
        setFileName(uploadedFileName);
        setErrors(result.errors);
        return;
      }

      setSchedule(result.schedule);
      setFileName(uploadedFileName);
      setErrors([]);
      setPlaybackState("idle");
      setElapsedSeconds(0);
    } catch (error) {
      setSchedule(null);
      setFileName(uploadedFileName);
      setErrors([error instanceof Error ? error.message : "Unable to parse JSON file."]);
    }
  }

  function playSchedule() {
    if (!schedule || playbackState === "playing") {
      return;
    }

    audioRef.current ??= new AudioEngine();
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
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-sky-700">actuator_schedule.v1</p>
            <h1 className="mt-1 text-3xl font-bold text-slate-950">WRO Angklung Simulator</h1>
          </div>
          <div className="text-right text-sm text-slate-600">
            <div>{schedule ? schedule.song.title : "No schedule loaded"}</div>
            <div>{fileName || "Upload exported JSON"}</div>
          </div>
        </header>

        <section className="grid gap-4 lg:grid-cols-[380px_1fr]">
          <div className="flex flex-col gap-4">
            <ScheduleUploader onLoad={loadSchedule} />
            {errors.length > 0 && (
              <div className="rounded border border-red-300 bg-red-50 p-4 text-sm text-red-900">
                <div className="mb-2 font-semibold">Invalid schedule file</div>
                <ul className="list-disc space-y-1 pl-5">
                  {errors.map((error) => (
                    <li key={error}>{error}</li>
                  ))}
                </ul>
              </div>
            )}
            <PlaybackControls
              disabled={!schedule}
              playbackState={playbackState}
              elapsedSeconds={elapsedSeconds}
              totalDurationSeconds={totalDuration}
              onPlay={playSchedule}
              onPause={pausePlayback}
              onStop={stopPlayback}
              onReset={resetPlayback}
            />
            <ScheduleJsonViewer schedule={schedule} />
          </div>

          <div className="flex flex-col gap-4">
            <AngklungRack instruments={instruments} activeInstrumentIds={activeInstrumentIds} />
            <TimelineView commands={schedule?.commands ?? []} activeCommandIds={activeCommandIds} />
          </div>
        </section>
      </div>
    </main>
  );
}

function buildRackInstruments(commands: ActuatorCommand[]): RackInstrument[] {
  const instrumentsByKey = new Map<string, RackInstrument>();
  for (const command of commands) {
    const key = `${command.instrument_id}:${command.actuator_channel}`;
    if (!instrumentsByKey.has(key)) {
      instrumentsByKey.set(key, {
        note: command.note,
        instrument_id: command.instrument_id,
        actuator_channel: command.actuator_channel,
      });
    }
  }

  return [...instrumentsByKey.values()].sort((left, right) => left.actuator_channel - right.actuator_channel);
}

import type { ActuatorCommand, ActuatorSchedule } from "./types";
import type { LoadedSong, SongNote } from "./songTypes";
import { ANGKLUNG_RANGE_NOTES, FRONTEND_INSTRUMENT_MAP } from "./instrumentMap";

export type ArrangementSettings = {
  strength: number;
  tempo: "normal" | "slower";
  mode: "melody" | "harmony";
};

const SLOWER_TEMPO_SCALE = 1.25;

export function buildScheduleFromBuiltInSong(song: LoadedSong, settings: ArrangementSettings): ActuatorSchedule {
  const effectiveSettings: ArrangementSettings =
    song.category === "hardware_trial" ? { ...settings, tempo: "normal", mode: "melody" } : settings;
  const scale = effectiveSettings.tempo === "slower" ? SLOWER_TEMPO_SCALE : 1;
  const notes = scaleNotes(song.notes, scale);
  const commands = buildCommands(notes, effectiveSettings);

  const totalDurationSeconds = commands.reduce(
    (max, command) => Math.max(max, command.start_time_seconds + command.duration_seconds),
    0,
  );

  return {
    format_version: "actuator_schedule.v1",
    project: "wro-angklung-ai-player",
    song: {
      title: song.title,
      tempo_bpm: effectiveSettings.tempo === "slower" ? Math.round(song.tempo_bpm / SLOWER_TEMPO_SCALE) : song.tempo_bpm,
      time_signature: song.time_signature ?? "4/4",
    },
    generated_at: new Date().toISOString(),
    timing: {
      time_unit: "seconds",
      zero_time: "playback_start",
      total_duration_seconds: roundSeconds(totalDurationSeconds),
    },
    hardware_profile: {
      instrument_type: "angklung",
      controller: "simulator",
      default_action: "shake",
    },
    commands,
    validation: {
      status: "valid",
      warnings: [],
      errors: [],
    },
  };
}

export function scaleNotes(notes: SongNote[], scale: number): SongNote[] {
  return notes.map((note) => ({
    ...note,
    start: roundSeconds(note.start * scale),
    duration: roundSeconds(note.duration * scale),
  }));
}

function buildCommands(notes: SongNote[], settings: ArrangementSettings): ActuatorCommand[] {
  const commands: ActuatorCommand[] = [];

  for (const note of notes) {
    commands.push(createCommand(note, commands.length + 1, settings));

    const harmonyNote = settings.mode === "harmony" ? findHarmonyNote(note.note) : null;
    if (harmonyNote) {
      commands.push(
        createCommand(
          {
            note: harmonyNote,
            start: note.start,
            duration: Math.min(note.duration, 0.45),
          },
          commands.length + 1,
          settings,
          clampStrength(settings.strength * 0.85),
        ),
      );
    }
  }

  return commands.sort((left, right) => left.start_time_seconds - right.start_time_seconds || left.actuator_channel - right.actuator_channel);
}

function createCommand(note: SongNote, commandNumber: number, settings: ArrangementSettings, strengthOverride?: number): ActuatorCommand {
  const mapping = FRONTEND_INSTRUMENT_MAP[note.note];
  if (!mapping) {
    throw new Error(`No frontend instrument mapping exists for note ${note.note}.`);
  }

  return {
    command_id: `cmd_${String(commandNumber).padStart(4, "0")}`,
    start_time_seconds: roundSeconds(note.start),
    note: note.note,
    instrument_id: mapping.instrument_id,
    actuator_channel: mapping.actuator_channel,
    action: "shake",
    duration_seconds: roundSeconds(note.duration),
    strength: clampStrength(strengthOverride ?? settings.strength),
  };
}

function findHarmonyNote(note: string): string | null {
  const noteIndex = ANGKLUNG_RANGE_NOTES.indexOf(note as (typeof ANGKLUNG_RANGE_NOTES)[number]);
  if (noteIndex === -1) {
    return null;
  }

  const lowerHarmony = ANGKLUNG_RANGE_NOTES[noteIndex - 2];
  if (lowerHarmony) {
    return lowerHarmony;
  }

  return ANGKLUNG_RANGE_NOTES[noteIndex + 2] ?? null;
}

function roundSeconds(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function clampStrength(value: number): number {
  return Math.max(0, Math.min(1, Math.round(value * 100) / 100));
}

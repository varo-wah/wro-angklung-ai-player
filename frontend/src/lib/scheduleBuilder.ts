import type { ActuatorCommand, ActuatorSchedule } from "./types";
import type { BuiltInSong, BuiltInSongNote } from "./builtInSongs";
import { FRONTEND_INSTRUMENT_MAP } from "./instrumentMap";

export type ArrangementSettings = {
  difficulty: "easy" | "medium";
  tempo: "normal" | "slower";
  mode: "melody" | "harmony";
};

const SLOWER_TEMPO_SCALE = 1.25;

export function buildScheduleFromBuiltInSong(song: BuiltInSong, settings: ArrangementSettings): ActuatorSchedule {
  const scale = settings.tempo === "slower" ? SLOWER_TEMPO_SCALE : 1;
  const notes = scaleNotes(song.notes, scale);
  const commands = notes.map<ActuatorCommand>((note, index) => {
    const mapping = FRONTEND_INSTRUMENT_MAP[note.note];
    if (!mapping) {
      throw new Error(`No frontend instrument mapping exists for note ${note.note}.`);
    }

    return {
      command_id: `cmd_${String(index + 1).padStart(4, "0")}`,
      start_time_seconds: roundSeconds(note.start),
      note: note.note,
      instrument_id: mapping.instrument_id,
      actuator_channel: mapping.actuator_channel,
      action: "shake",
      duration_seconds: roundSeconds(note.duration),
      strength: settings.difficulty === "easy" ? 0.75 : 0.85,
    };
  });

  const totalDurationSeconds = commands.reduce(
    (max, command) => Math.max(max, command.start_time_seconds + command.duration_seconds),
    0,
  );

  return {
    format_version: "actuator_schedule.v1",
    project: "wro-angklung-ai-player",
    song: {
      title: song.title,
      tempo_bpm: settings.tempo === "slower" ? Math.round(song.tempo_bpm / SLOWER_TEMPO_SCALE) : song.tempo_bpm,
      time_signature: "4/4",
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

export function scaleNotes(notes: BuiltInSongNote[], scale: number): BuiltInSongNote[] {
  return notes.map((note) => ({
    ...note,
    start: roundSeconds(note.start * scale),
    duration: roundSeconds(note.duration * scale),
  }));
}

function roundSeconds(value: number): number {
  return Math.round(value * 1000) / 1000;
}

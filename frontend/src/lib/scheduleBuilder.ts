import type { ActuatorCommand, ActuatorSchedule } from "./types";
import type { LoadedSong, SongNote } from "./songTypes";
import { FRONTEND_INSTRUMENT_MAP } from "./instrumentMap";

export type ArrangementSettings = {
  strength: number;
  tempo: "normal" | "slower";
  mode: "melody" | "harmony";
};

const SLOWER_TEMPO_SCALE = 1.25;

export function buildScheduleFromBuiltInSong(song: LoadedSong, settings: ArrangementSettings): ActuatorSchedule {
  const effectiveSettings: ArrangementSettings =
    song.category === "hardware_trial" ? { ...settings, tempo: "normal", mode: "melody" } : settings;
  const profile = song.category === "hardware_trial" ? undefined : song.performance_profile;
  const baseTempo = profile?.tempo_bpm ?? song.tempo_bpm;
  const scale = (song.tempo_bpm / baseTempo) * (effectiveSettings.tempo === "slower" ? SLOWER_TEMPO_SCALE : 1);
  const selectedNotes = song.category === "hardware_trial" || effectiveSettings.mode === "harmony"
    ? song.notes
    : song.notes.filter(note => !["accompaniment", "support"].includes(note.role ?? ""));
  const notes = scaleNotes(selectedNotes, scale);
  const commands = buildCommands(notes, effectiveSettings);
  if (profile) applyReleaseGaps(commands, profile.release_seconds, profile.repeat_gap_seconds);
  if (song.category !== "hardware_trial") {
    // Apply after tempo and articulation so Slower never lengthens the support pulse.
    const byId = new Map(notes.map((note, index) => [`cmd_${String(index + 1).padStart(4, "0")}`, note]));
    const melodyCommands = commands.filter(command => !["accompaniment", "support"].includes(byId.get(command.command_id)?.role ?? ""));
    for (const command of commands) {
      const note = byId.get(command.command_id);
      if (note && ["accompaniment", "support"].includes(note.role ?? "")) {
        command.duration_seconds = Math.min(command.duration_seconds, 0.18);
        if (song.playback_policy !== "authored") {
          command.strength = Math.max(command.strength, clampStrength(effectiveSettings.strength * 1.5));
        }
      } else if (note) {
        // Shorten the existing hold; never restore/extend it into a written rest.
        const nextMelody = melodyCommands.find(next => next.start_time_seconds > command.start_time_seconds);
        const interval = nextMelody ? nextMelody.start_time_seconds - command.start_time_seconds : Infinity;
        const gap = Math.min(0.12, interval * 0.35);
        const released = command.duration_seconds - Math.min(0.04, command.duration_seconds * 0.2);
        command.duration_seconds = roundSeconds(Math.max(0.01, Math.min(released, interval - gap)));
      }
    }
  }

  // Final limits run after tempo scaling, including authored songs and trials.
  // Leave a larger motor release window without delaying the next attack.
  for (const command of commands) {
    const next = commands.find(candidate => candidate.actuator_channel === command.actuator_channel && candidate.start_time_seconds > command.start_time_seconds);
    const interval = next ? next.start_time_seconds - command.start_time_seconds : Infinity;
    const gap = Math.min(0.12, interval * 0.35);
    command.duration_seconds = roundSeconds(Math.max(0.01, Math.min(command.duration_seconds, 2, interval - gap)));
  }

  const totalDurationSeconds = commands.reduce(
    (max, command) => Math.max(max, command.start_time_seconds + command.duration_seconds),
    0,
  );

  return {
    format_version: "actuator_schedule.v1",
    project: "wro-angklung-ai-player",
    song: {
      title: song.title,
      tempo_bpm: effectiveSettings.tempo === "slower" ? Math.round(baseTempo / SLOWER_TEMPO_SCALE) : baseTempo,
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
    duration_seconds: playbackDuration(note),
    strength: clampStrength(strengthOverride ?? settings.strength * songStrengthMultiplier(note)),
  };
}

function roundSeconds(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function clampStrength(value: number): number {
  return Math.max(0, Math.min(1, Math.round(value * 100) / 100));
}

function songStrengthMultiplier(note: SongNote): number {
  const multiplier = note.playback_strength_multiplier;
  if (multiplier === undefined) return 1;
  if (!Number.isFinite(multiplier) || multiplier < 0) {
    throw new Error(`Invalid playback strength multiplier for ${note.note}.`);
  }
  return multiplier;
}

function playbackDuration(note: SongNote): number {
  const multiplier = note.playback_duration_multiplier ?? 1;
  if (!Number.isFinite(multiplier) || multiplier <= 0 || multiplier > 1) {
    throw new Error(`Invalid playback duration multiplier for ${note.note}.`);
  }
  return roundSeconds(note.duration * multiplier);
}

// Release earlier without moving any attack or changing strength. Preserve at
// least 75% of short holds in the general trim, then separate same-channel
// retriggers where possible. Simultaneous duplicates are left for validation.
export function applyReleaseGaps(commands: ActuatorCommand[], release: number, repeatGap: number): void {
  const nextByChannel = new Map<number, ActuatorCommand>();
  for (let i = commands.length - 1; i >= 0; i--) {
    const command = commands[i];
    const original = command.duration_seconds;
    const minimum = Math.min(original, 0.07);
    let hold = Math.max(minimum, original - Math.min(release, original * 0.25));
    const next = nextByChannel.get(command.actuator_channel);
    if (next && next.start_time_seconds > command.start_time_seconds) {
      const available = next.start_time_seconds - command.start_time_seconds - repeatGap;
      if (available >= minimum) hold = Math.min(hold, available);
    }
    command.duration_seconds = roundSeconds(hold);
    nextByChannel.set(command.actuator_channel, command);
  }
}

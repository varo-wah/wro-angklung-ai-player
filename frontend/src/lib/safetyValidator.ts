import type { ActuatorCommand, ActuatorSchedule } from "./types";
import { MOTOR_LIMITS } from "./motorLimits";

export type SafetyCheck = {
  label: string;
  status: "passed" | "warning" | "failed";
  detail: string;
};

export type SafetyReport = {
  overall: "PASSED" | "FAILED";
  checks: SafetyCheck[];
  maxSimultaneousActuators: number;
};

export function validateMotorSafety(schedule: ActuatorSchedule): SafetyReport {
  const commands = schedule.commands;
  const checks: SafetyCheck[] = [];
  const unavailableNotes = commands.filter((command) => !command.note.trim());
  checks.push({
    label: "All notes available",
    status: unavailableNotes.length === 0 ? "passed" : "failed",
    detail: unavailableNotes.length === 0 ? "Every command has a playable note." : `${unavailableNotes.length} commands have empty notes.`,
  });

  const tooShort = commands.filter((command) => command.duration_seconds < MOTOR_LIMITS.min_duration_seconds);
  checks.push({
    label: "Timing safe",
    status: tooShort.length === 0 ? "passed" : "failed",
    detail:
      tooShort.length === 0
        ? `All durations are at least ${MOTOR_LIMITS.min_duration_seconds.toFixed(2)}s.`
        : `${tooShort.length} commands are shorter than ${MOTOR_LIMITS.min_duration_seconds.toFixed(2)}s.`,
  });

  const conflicts = findRepeatedActuatorConflicts(commands);
  checks.push({
    label: "Repeated actuator conflict",
    status: conflicts.length === 0 ? "passed" : "warning",
    detail:
      conflicts.length === 0
        ? `Same actuator gap is at least ${MOTOR_LIMITS.min_same_actuator_gap_seconds.toFixed(2)}s.`
        : `${conflicts.length} repeated actuator gaps are below ${MOTOR_LIMITS.min_same_actuator_gap_seconds.toFixed(2)}s.`,
  });

  const maxSimultaneousActuators = calculateMaxSimultaneousActuators(commands);
  checks.push({
    label: "Max simultaneous actuators",
    status: maxSimultaneousActuators <= MOTOR_LIMITS.max_simultaneous_actuators ? "passed" : "failed",
    detail: `${maxSimultaneousActuators} active at once; limit is ${MOTOR_LIMITS.max_simultaneous_actuators}.`,
  });

  const overall = checks.some((check) => check.status === "failed") ? "FAILED" : "PASSED";
  return { overall, checks, maxSimultaneousActuators };
}

function findRepeatedActuatorConflicts(commands: ActuatorCommand[]): string[] {
  const byChannel = new Map<number, ActuatorCommand[]>();
  for (const command of commands) {
    const channelCommands = byChannel.get(command.actuator_channel) ?? [];
    channelCommands.push(command);
    byChannel.set(command.actuator_channel, channelCommands);
  }

  const conflicts: string[] = [];
  for (const channelCommands of byChannel.values()) {
    const sorted = [...channelCommands].sort((left, right) => left.start_time_seconds - right.start_time_seconds);
    for (let index = 1; index < sorted.length; index += 1) {
      const gap = sorted[index].start_time_seconds - sorted[index - 1].start_time_seconds;
      if (gap < MOTOR_LIMITS.min_same_actuator_gap_seconds) {
        conflicts.push(sorted[index].command_id);
      }
    }
  }
  return conflicts;
}

function calculateMaxSimultaneousActuators(commands: ActuatorCommand[]): number {
  const events = commands.flatMap((command) => [
    { time: command.start_time_seconds, delta: 1 },
    { time: command.start_time_seconds + command.duration_seconds, delta: -1 },
  ]);
  events.sort((left, right) => left.time - right.time || left.delta - right.delta);

  let active = 0;
  let maxActive = 0;
  for (const event of events) {
    active += event.delta;
    maxActive = Math.max(maxActive, active);
  }
  return maxActive;
}

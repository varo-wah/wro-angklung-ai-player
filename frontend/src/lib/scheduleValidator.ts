import type { ActuatorCommand, ActuatorSchedule } from "./types";
import { FRONTEND_INSTRUMENT_MAP } from "./instrumentMap";

const REQUIRED_COMMAND_FIELDS: Array<keyof ActuatorCommand> = [
  "command_id",
  "start_time_seconds",
  "note",
  "instrument_id",
  "actuator_channel",
  "action",
  "duration_seconds",
  "strength",
];

export type ValidationResult =
  | { ok: true; schedule: ActuatorSchedule }
  | { ok: false; errors: string[] };

export function validateSchedulePayload(payload: unknown): ValidationResult {
  const errors: string[] = [];

  if (!isRecord(payload)) {
    return { ok: false, errors: ["Schedule file must contain a JSON object."] };
  }

  if (payload.format_version !== "actuator_schedule.v1") {
    errors.push("format_version must be actuator_schedule.v1.");
  }

  if (!Array.isArray(payload.commands)) {
    errors.push("commands must exist and must be an array.");
  }

  if (!isRecord(payload.song)) {
    errors.push("song metadata is missing or invalid.");
  }

  if (!isRecord(payload.timing)) {
    errors.push("timing metadata is missing or invalid.");
  }

  const commands = Array.isArray(payload.commands) ? payload.commands : [];
  const seenCommandIds = new Set<string>();
  let previousStart = Number.NEGATIVE_INFINITY;

  commands.forEach((command, index) => {
    if (!isRecord(command)) {
      errors.push(`commands[${index}] must be an object.`);
      return;
    }

    for (const field of REQUIRED_COMMAND_FIELDS) {
      if (!(field in command)) {
        errors.push(`commands[${index}] is missing ${field}.`);
      }
    }

    if (typeof command.command_id === "string") {
      if (seenCommandIds.has(command.command_id)) {
        errors.push(`Duplicate command_id: ${command.command_id}.`);
      }
      seenCommandIds.add(command.command_id);
    } else {
      errors.push(`commands[${index}].command_id must be a string.`);
    }

    if (!isNonNegativeNumber(command.start_time_seconds)) {
      errors.push(`commands[${index}].start_time_seconds must be a non-negative number.`);
    } else if (command.start_time_seconds < previousStart) {
      errors.push("commands must be sorted by start_time_seconds.");
    } else {
      previousStart = command.start_time_seconds;
    }

    if (!isPositiveNumber(command.duration_seconds)) {
      errors.push(`commands[${index}].duration_seconds must be greater than 0.`);
    }

    if (!isStrength(command.strength)) {
      errors.push(`commands[${index}].strength must be between 0.0 and 1.0.`);
    }

    if (typeof command.note !== "string" || command.note.trim() === "") {
      errors.push(`commands[${index}].note must be a non-empty string.`);
    } else {
      const mapping = FRONTEND_INSTRUMENT_MAP[command.note];
      if (!mapping) {
        errors.push(`commands[${index}].note ${command.note} is outside the G3-C6 angklung rack.`);
      } else {
        if (typeof command.instrument_id === "string" && command.instrument_id !== mapping.instrument_id) {
          errors.push(`commands[${index}].instrument_id does not match ${command.note}.`);
        }
        if (Number.isInteger(command.actuator_channel) && command.actuator_channel !== mapping.actuator_channel) {
          errors.push(`commands[${index}].actuator_channel does not match ${command.note}.`);
        }
      }
      if (/[#b]/.test(command.note)) {
        errors.push(`commands[${index}].note ${command.note} contains a sharp or flat that the current rack cannot play.`);
      }
    }

    if (typeof command.instrument_id !== "string" || command.instrument_id.trim() === "") {
      errors.push(`commands[${index}].instrument_id must be a non-empty string.`);
    }

    if (!isNonNegativeInteger(command.actuator_channel)) {
      errors.push(`commands[${index}].actuator_channel must be a non-negative integer.`);
    }

    if (typeof command.action !== "string" || command.action.trim() === "") {
      errors.push(`commands[${index}].action must be a non-empty string.`);
    }
  });

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return { ok: true, schedule: payload as ActuatorSchedule };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isPositiveNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function isStrength(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && typeof value === "number" && value >= 0;
}

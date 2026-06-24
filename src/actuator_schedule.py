"""Official actuator schedule JSON format v1."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
import json
from pathlib import Path
from typing import Any

from src.instrument_mapper import InstrumentMapError, InstrumentMapper
from src.song_parser import Song


FORMAT_VERSION = "actuator_schedule.v1"
PROJECT_NAME = "wro-angklung-ai-player"
DEFAULT_TIME_SIGNATURE = "4/4"
DEFAULT_ACTION = "shake"
DEFAULT_STRENGTH = 0.8


class ActuatorScheduleError(ValueError):
    """Raised when an actuator schedule is invalid."""


@dataclass(frozen=True)
class ActuatorCommand:
    """A single actuator command in relative playback time."""

    command_id: str
    start_time_seconds: float
    note: str
    instrument_id: str
    actuator_channel: int
    action: str
    duration_seconds: float
    strength: float

    def __post_init__(self) -> None:
        if not self.command_id:
            raise ActuatorScheduleError("command_id must be a non-empty string.")
        if self.start_time_seconds < 0:
            raise ActuatorScheduleError("start_time_seconds must be non-negative.")
        if self.duration_seconds <= 0:
            raise ActuatorScheduleError("duration_seconds must be positive.")
        if self.strength < 0.0 or self.strength > 1.0:
            raise ActuatorScheduleError("strength must be between 0.0 and 1.0.")

    def to_dict(self) -> dict[str, Any]:
        """Return the official JSON representation for this command."""

        return {
            "command_id": self.command_id,
            "start_time_seconds": self.start_time_seconds,
            "note": self.note,
            "instrument_id": self.instrument_id,
            "actuator_channel": self.actuator_channel,
            "action": self.action,
            "duration_seconds": self.duration_seconds,
            "strength": self.strength,
        }


@dataclass(frozen=True)
class ActuatorSchedule:
    """Official actuator schedule export container."""

    song_title: str
    tempo_bpm: int
    time_signature: str
    total_duration_seconds: float
    commands: tuple[ActuatorCommand, ...]
    generated_at: str
    validation_status: str = "valid"
    validation_warnings: tuple[str, ...] = ()
    validation_errors: tuple[str, ...] = ()

    def to_dict(self) -> dict[str, Any]:
        """Return the official actuator_schedule.v1 JSON structure."""

        return {
            "format_version": FORMAT_VERSION,
            "project": PROJECT_NAME,
            "song": {
                "title": self.song_title,
                "tempo_bpm": self.tempo_bpm,
                "time_signature": self.time_signature,
            },
            "generated_at": self.generated_at,
            "timing": {
                "time_unit": "seconds",
                "zero_time": "playback_start",
                "total_duration_seconds": self.total_duration_seconds,
            },
            "hardware_profile": {
                "instrument_type": "angklung",
                "controller": "simulator",
                "default_action": DEFAULT_ACTION,
            },
            "commands": [command.to_dict() for command in self.commands],
            "validation": {
                "status": self.validation_status,
                "warnings": list(self.validation_warnings),
                "errors": list(self.validation_errors),
            },
        }

    def write_json(self, path: str | Path) -> None:
        """Write the schedule as pretty-printed JSON."""

        output_path = Path(path)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(json.dumps(self.to_dict(), indent=2) + "\n", encoding="utf-8")


def build_actuator_schedule(
    song: Song,
    instrument_mapper: InstrumentMapper,
    generated_at: datetime | None = None,
) -> ActuatorSchedule:
    """Build and validate an actuator schedule from a parsed song."""

    sorted_notes = sorted(song.notes, key=lambda note: note.start)
    commands: list[ActuatorCommand] = []

    for index, note in enumerate(sorted_notes, start=1):
        try:
            mapping = instrument_mapper.resolve(note.note)
        except InstrumentMapError as exc:
            raise ActuatorScheduleError(str(exc)) from exc

        commands.append(
            ActuatorCommand(
                command_id=f"cmd_{index:04d}",
                start_time_seconds=note.start,
                note=note.note,
                instrument_id=mapping.instrument_id,
                actuator_channel=mapping.actuator_channel,
                action=DEFAULT_ACTION,
                duration_seconds=note.duration,
                strength=DEFAULT_STRENGTH,
            )
        )

    total_duration_seconds = max(
        (command.start_time_seconds + command.duration_seconds for command in commands),
        default=0.0,
    )
    schedule = ActuatorSchedule(
        song_title=song.title,
        tempo_bpm=song.tempo_bpm,
        time_signature=DEFAULT_TIME_SIGNATURE,
        total_duration_seconds=total_duration_seconds,
        commands=tuple(commands),
        generated_at=_format_generated_at(generated_at),
    )
    validate_actuator_schedule(schedule, instrument_mapper)
    return schedule


def validate_actuator_schedule(schedule: ActuatorSchedule, instrument_mapper: InstrumentMapper) -> None:
    """Validate command consistency against the official v1 rules."""

    command_ids: set[str] = set()
    previous_start_time: float | None = None

    for command in schedule.commands:
        if command.command_id in command_ids:
            raise ActuatorScheduleError(f"Duplicate command_id: {command.command_id}")
        command_ids.add(command.command_id)

        if previous_start_time is not None and command.start_time_seconds < previous_start_time:
            raise ActuatorScheduleError("Commands must be sorted by start_time_seconds.")
        previous_start_time = command.start_time_seconds

        try:
            mapping = instrument_mapper.resolve(command.note)
        except InstrumentMapError as exc:
            raise ActuatorScheduleError(str(exc)) from exc

        if command.instrument_id != mapping.instrument_id:
            raise ActuatorScheduleError(f"instrument_id does not match mapping for note {command.note}.")
        if command.actuator_channel != mapping.actuator_channel:
            raise ActuatorScheduleError(f"actuator_channel does not match mapping for note {command.note}.")


def _format_generated_at(generated_at: datetime | None) -> str:
    timestamp = generated_at or datetime.now(timezone.utc)
    if timestamp.tzinfo is None:
        timestamp = timestamp.replace(tzinfo=timezone.utc)
    return timestamp.isoformat()

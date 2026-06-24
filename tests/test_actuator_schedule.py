from datetime import datetime, timezone
import json

import pytest

from src.actuator_schedule import (
    ActuatorCommand,
    ActuatorSchedule,
    ActuatorScheduleError,
    build_actuator_schedule,
    validate_actuator_schedule,
)
from src.instrument_mapper import parse_instrument_map
from src.song_parser import Note, Song


def test_actuator_command_serializes_required_fields() -> None:
    command = ActuatorCommand(
        command_id="cmd_0001",
        start_time_seconds=0.5,
        note="C4",
        instrument_id="angklung_01",
        actuator_channel=0,
        action="shake",
        duration_seconds=0.25,
        strength=0.8,
    )

    assert command.to_dict() == {
        "command_id": "cmd_0001",
        "start_time_seconds": 0.5,
        "note": "C4",
        "instrument_id": "angklung_01",
        "actuator_channel": 0,
        "action": "shake",
        "duration_seconds": 0.25,
        "strength": 0.8,
    }


def test_actuator_schedule_exports_official_top_level_structure() -> None:
    mapper = parse_instrument_map({"C4": {"instrument_id": "angklung_01", "actuator_channel": 0}})
    song = Song(
        title="Example Song",
        tempo_bpm=90,
        notes=(Note(note="C4", start=0.0, duration=0.25),),
    )

    schedule = build_actuator_schedule(
        song,
        mapper,
        generated_at=datetime(2026, 6, 24, 10, 0, tzinfo=timezone.utc),
    )

    exported = schedule.to_dict()

    assert exported["format_version"] == "actuator_schedule.v1"
    assert exported["project"] == "wro-angklung-ai-player"
    assert exported["song"] == {
        "title": "Example Song",
        "tempo_bpm": 90,
        "time_signature": "4/4",
    }
    assert exported["timing"]["total_duration_seconds"] == 0.25
    assert exported["hardware_profile"] == {
        "instrument_type": "angklung",
        "controller": "simulator",
        "default_action": "shake",
    }
    assert exported["validation"] == {"status": "valid", "warnings": [], "errors": []}


def test_invalid_strength_is_rejected() -> None:
    with pytest.raises(ActuatorScheduleError, match="strength"):
        ActuatorCommand(
            command_id="cmd_0001",
            start_time_seconds=0.0,
            note="C4",
            instrument_id="angklung_01",
            actuator_channel=0,
            action="shake",
            duration_seconds=0.25,
            strength=1.1,
        )


def test_negative_start_time_is_rejected() -> None:
    with pytest.raises(ActuatorScheduleError, match="start_time_seconds"):
        ActuatorCommand(
            command_id="cmd_0001",
            start_time_seconds=-0.1,
            note="C4",
            instrument_id="angklung_01",
            actuator_channel=0,
            action="shake",
            duration_seconds=0.25,
            strength=0.8,
        )


def test_non_positive_duration_is_rejected() -> None:
    with pytest.raises(ActuatorScheduleError, match="duration_seconds"):
        ActuatorCommand(
            command_id="cmd_0001",
            start_time_seconds=0.0,
            note="C4",
            instrument_id="angklung_01",
            actuator_channel=0,
            action="shake",
            duration_seconds=0.0,
            strength=0.8,
        )


def test_unknown_note_is_rejected() -> None:
    mapper = parse_instrument_map({"C4": {"instrument_id": "angklung_01", "actuator_channel": 0}})
    song = Song(
        title="Unknown",
        tempo_bpm=90,
        notes=(Note(note="D4", start=0.0, duration=0.25),),
    )

    with pytest.raises(ActuatorScheduleError, match="D4"):
        build_actuator_schedule(song, mapper)


def test_mapping_mismatch_is_rejected() -> None:
    mapper = parse_instrument_map({"C4": {"instrument_id": "angklung_01", "actuator_channel": 0}})
    schedule = ActuatorSchedule(
        song_title="Mismatch",
        tempo_bpm=90,
        time_signature="4/4",
        total_duration_seconds=0.25,
        commands=(ActuatorCommand("cmd_0001", 0.0, "C4", "angklung_wrong", 99, "shake", 0.25, 0.8),),
        generated_at="2026-06-24T10:00:00+08:00",
    )

    with pytest.raises(ActuatorScheduleError, match="instrument_id"):
        validate_actuator_schedule(schedule, mapper)


def test_duplicate_command_id_is_rejected() -> None:
    mapper = parse_instrument_map({"C4": {"instrument_id": "angklung_01", "actuator_channel": 0}})
    schedule = ActuatorSchedule(
        song_title="Duplicate",
        tempo_bpm=90,
        time_signature="4/4",
        total_duration_seconds=0.5,
        commands=(
            ActuatorCommand("cmd_0001", 0.0, "C4", "angklung_01", 0, "shake", 0.25, 0.8),
            ActuatorCommand("cmd_0001", 0.5, "C4", "angklung_01", 0, "shake", 0.25, 0.8),
        ),
        generated_at="2026-06-24T10:00:00+08:00",
    )

    with pytest.raises(ActuatorScheduleError, match="Duplicate"):
        validate_actuator_schedule(schedule, mapper)


def test_commands_must_be_sorted_by_start_time() -> None:
    mapper = parse_instrument_map({"C4": {"instrument_id": "angklung_01", "actuator_channel": 0}})
    schedule = ActuatorSchedule(
        song_title="Unsorted",
        tempo_bpm=90,
        time_signature="4/4",
        total_duration_seconds=1.0,
        commands=(
            ActuatorCommand("cmd_0001", 1.0, "C4", "angklung_01", 0, "shake", 0.25, 0.8),
            ActuatorCommand("cmd_0002", 0.5, "C4", "angklung_01", 0, "shake", 0.25, 0.8),
        ),
        generated_at="2026-06-24T10:00:00+08:00",
    )

    with pytest.raises(ActuatorScheduleError, match="sorted"):
        validate_actuator_schedule(schedule, mapper)


def test_exported_commands_are_in_time_order() -> None:
    mapper = parse_instrument_map(
        {
            "C4": {"instrument_id": "angklung_01", "actuator_channel": 0},
            "G4": {"instrument_id": "angklung_05", "actuator_channel": 4},
        }
    )
    song = Song(
        title="Sorted Export",
        tempo_bpm=90,
        notes=(
            Note(note="G4", start=1.0, duration=0.25),
            Note(note="C4", start=0.0, duration=0.25),
        ),
    )

    schedule = build_actuator_schedule(song, mapper)
    start_times = [command["start_time_seconds"] for command in schedule.to_dict()["commands"]]

    assert start_times == [0.0, 1.0]


def test_schedule_writes_json_file(tmp_path) -> None:
    mapper = parse_instrument_map({"C4": {"instrument_id": "angklung_01", "actuator_channel": 0}})
    song = Song(
        title="Writable",
        tempo_bpm=90,
        notes=(Note(note="C4", start=0.0, duration=0.25),),
    )
    output_path = tmp_path / "outputs" / "example_schedule.json"

    schedule = build_actuator_schedule(song, mapper)
    schedule.write_json(output_path)

    exported = json.loads(output_path.read_text(encoding="utf-8"))
    assert exported["format_version"] == "actuator_schedule.v1"

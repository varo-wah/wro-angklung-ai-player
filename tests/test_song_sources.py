import json

import pytest

from src.actuator_schedule import build_actuator_schedule
from src.instrument_mapper import parse_instrument_map
from src.song_parser import load_song, parse_song
from src.song_sources.models import SourceInput, SourceResult
from src.song_sources.process_source import build_source_input, process_source
from src.song_sources.youtube_source import (
    SourceValidationError,
    YOUTUBE_MOCK_WARNING,
    create_youtube_source,
)
from src.transcription.mock_transcriber import transcribe_mock
from src.transcription.transcription_to_song import transcription_to_song_dict


def test_source_input_serializes() -> None:
    source_input = SourceInput(
        source_type="youtube_url",
        title="Example Song",
        path_or_url="https://youtube.com/watch?v=example",
        metadata={"provider": "youtube"},
    )

    assert source_input.to_dict() == {
        "source_type": "youtube_url",
        "title": "Example Song",
        "path_or_url": "https://youtube.com/watch?v=example",
        "metadata": {"provider": "youtube"},
    }


def test_source_result_serializes() -> None:
    result = SourceResult(
        title="Example Song",
        source_type="youtube_url",
        confidence=0.25,
        is_exact=False,
        warnings=("mocked",),
        internal_song_path="songs/imported/example_song.json",
    )

    assert result.to_dict() == {
        "title": "Example Song",
        "source_type": "youtube_url",
        "confidence": 0.25,
        "is_exact": False,
        "warnings": ["mocked"],
        "internal_song_path": "songs/imported/example_song.json",
    }


def test_valid_youtube_url_is_accepted() -> None:
    source_input = create_youtube_source("https://youtube.com/watch?v=example", "Example Song")

    assert source_input.source_type == "youtube_url"
    assert source_input.path_or_url == "https://youtube.com/watch?v=example"


def test_invalid_youtube_url_is_rejected() -> None:
    with pytest.raises(SourceValidationError, match="Invalid YouTube URL"):
        create_youtube_source("https://example.com/watch?v=example", "Example Song")


def test_youtube_source_returns_mock_warning() -> None:
    source_input = create_youtube_source("https://youtu.be/example", "Example Song")

    assert source_input.metadata["warning"] == YOUTUBE_MOCK_WARNING


def test_mocked_transcription_creates_valid_note_events() -> None:
    source_input = create_youtube_source("https://youtube.com/watch?v=example", "Example Song")
    events = transcribe_mock(source_input)

    assert len(events) == 4
    assert events[0].note == "G4"
    assert events[0].start_time_seconds == 0.0
    assert events[0].duration_seconds > 0
    assert 0.0 <= events[0].strength <= 1.0


def test_transcription_to_song_creates_valid_internal_song_json() -> None:
    source_input = create_youtube_source("https://youtube.com/watch?v=example", "Example Song")
    song_data = transcription_to_song_dict(source_input.title, transcribe_mock(source_input))

    song = parse_song(song_data)

    assert song.title == "Example Song"
    assert song.notes[0].note == "G4"


def test_process_source_writes_internal_song(tmp_path) -> None:
    source_input = build_source_input("youtube_url", "Example Song", "https://youtube.com/watch?v=example")
    result = process_source(source_input, output_dir=tmp_path)

    song_path = tmp_path / "example_song.json"
    assert result.internal_song_path == str(song_path)
    assert song_path.exists()
    assert json.loads(song_path.read_text(encoding="utf-8"))["title"] == "Example Song"
    assert YOUTUBE_MOCK_WARNING in result.warnings


def test_generated_internal_song_can_export_actuator_schedule(tmp_path) -> None:
    source_input = create_youtube_source("https://youtube.com/watch?v=example", "Example Song")
    result = process_source(source_input, output_dir=tmp_path)
    song = load_song(result.internal_song_path)
    mapper = parse_instrument_map(
        {
            "G4": {"instrument_id": "angklung_01", "actuator_channel": 0},
            "A4": {"instrument_id": "angklung_02", "actuator_channel": 1},
            "B4": {"instrument_id": "angklung_03", "actuator_channel": 2},
            "C5": {"instrument_id": "angklung_04", "actuator_channel": 3},
        }
    )

    schedule = build_actuator_schedule(song, mapper)

    assert schedule.to_dict()["format_version"] == "actuator_schedule.v1"
    assert len(schedule.commands) == 4

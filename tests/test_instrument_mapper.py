from pathlib import Path

import pytest

from src.instrument_mapper import (
    InstrumentMapError,
    InstrumentMapping,
    load_instrument_mapper,
    parse_instrument_map,
)
from src.song_parser import Note, Song


def test_parse_instrument_map_resolves_known_note() -> None:
    mapper = parse_instrument_map(
        {
            "C4": {
                "instrument_id": "angklung_01",
                "actuator_channel": 0,
            }
        }
    )

    assert mapper.resolve("C4") == InstrumentMapping(
        note="C4",
        instrument_id="angklung_01",
        actuator_channel=0,
    )


def test_load_instrument_mapper_reads_json_file(tmp_path: Path) -> None:
    map_path = tmp_path / "instrument_map.json"
    map_path.write_text(
        """
        {
          "E4": {
            "instrument_id": "angklung_02",
            "actuator_channel": 1
          }
        }
        """,
        encoding="utf-8",
    )

    mapper = load_instrument_mapper(map_path)

    assert mapper.resolve("E4").actuator_channel == 1


def test_resolve_missing_note_raises_clear_error() -> None:
    mapper = parse_instrument_map({"C4": {"instrument_id": "angklung_01", "actuator_channel": 0}})

    with pytest.raises(InstrumentMapError, match="D4"):
        mapper.resolve("D4")


def test_validate_song_raises_for_unmapped_song_note() -> None:
    mapper = parse_instrument_map({"C4": {"instrument_id": "angklung_01", "actuator_channel": 0}})
    song = Song(
        title="Missing Map",
        tempo_bpm=120,
        notes=(
            Note(note="C4", start=0.0, duration=0.5),
            Note(note="D4", start=0.5, duration=0.5),
        ),
    )

    with pytest.raises(InstrumentMapError, match="D4"):
        mapper.validate_song(song)


@pytest.mark.parametrize(
    "raw_map",
    [
        {},
        [],
        {"": {"instrument_id": "angklung_01", "actuator_channel": 0}},
        {"C4": "angklung_01"},
        {"C4": {"instrument_id": "", "actuator_channel": 0}},
        {"C4": {"instrument_id": "angklung_01", "actuator_channel": "0"}},
        {"C4": {"instrument_id": "angklung_01", "actuator_channel": -1}},
    ],
)
def test_parse_instrument_map_rejects_invalid_data(raw_map: object) -> None:
    with pytest.raises(InstrumentMapError):
        parse_instrument_map(raw_map)

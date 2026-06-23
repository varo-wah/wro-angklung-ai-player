"""Resolve song notes to configured angklung instruments and actuator channels."""

from __future__ import annotations

from dataclasses import dataclass
import json
from pathlib import Path
from typing import Any

from src.song_parser import Song


@dataclass(frozen=True)
class InstrumentMapping:
    """Physical routing metadata for a playable angklung note."""

    note: str
    instrument_id: str
    actuator_channel: int


class InstrumentMapError(ValueError):
    """Raised when an instrument map is invalid or incomplete."""


class InstrumentMapper:
    """Lookup service for note-to-actuator mappings."""

    def __init__(self, mappings: dict[str, InstrumentMapping]) -> None:
        self._mappings = mappings

    def resolve(self, note: str) -> InstrumentMapping:
        """Return mapping metadata for a note, or fail clearly."""

        try:
            return self._mappings[note]
        except KeyError as exc:
            raise InstrumentMapError(f"No instrument mapping configured for note: {note}") from exc

    def validate_song(self, song: Song) -> None:
        """Ensure every note in a song has an instrument mapping."""

        missing_notes = sorted({note.note for note in song.notes if note.note not in self._mappings})
        if missing_notes:
            joined_notes = ", ".join(missing_notes)
            raise InstrumentMapError(f"Song contains unmapped note(s): {joined_notes}")


def load_instrument_mapper(path: str | Path) -> InstrumentMapper:
    """Load and validate an instrument map JSON file."""

    map_path = Path(path)
    try:
        raw_map = json.loads(map_path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise InstrumentMapError(f"Instrument map file not found: {map_path}") from exc
    except json.JSONDecodeError as exc:
        raise InstrumentMapError(f"Invalid JSON in instrument map file: {map_path}") from exc

    return parse_instrument_map(raw_map)


def parse_instrument_map(raw_map: dict[str, Any]) -> InstrumentMapper:
    """Validate raw mapping data and return a mapper."""

    if not isinstance(raw_map, dict) or not raw_map:
        raise InstrumentMapError("Instrument map must be a non-empty JSON object.")

    mappings: dict[str, InstrumentMapping] = {}
    for note, raw_mapping in raw_map.items():
        if not isinstance(note, str) or not note.strip():
            raise InstrumentMapError("Instrument map note keys must be non-empty strings.")
        if not isinstance(raw_mapping, dict):
            raise InstrumentMapError(f"Mapping for note {note} must be an object.")

        instrument_id = raw_mapping.get("instrument_id")
        if not isinstance(instrument_id, str) or not instrument_id.strip():
            raise InstrumentMapError(f"Mapping for note {note} must include a non-empty instrument_id.")

        actuator_channel = raw_mapping.get("actuator_channel")
        if not isinstance(actuator_channel, int) or isinstance(actuator_channel, bool) or actuator_channel < 0:
            raise InstrumentMapError(f"Mapping for note {note} must include a non-negative integer actuator_channel.")

        normalized_note = note.strip()
        mappings[normalized_note] = InstrumentMapping(
            note=normalized_note,
            instrument_id=instrument_id.strip(),
            actuator_channel=actuator_channel,
        )

    return InstrumentMapper(mappings)

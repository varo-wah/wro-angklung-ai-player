"""Parse and validate angklung song JSON files."""

from __future__ import annotations

from dataclasses import dataclass
import json
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class Note:
    """A single angklung note event in relative song time."""

    note: str
    start: float
    duration: float


@dataclass(frozen=True)
class Song:
    """A parsed song ready for scheduling."""

    title: str
    tempo_bpm: int
    notes: tuple[Note, ...]


class SongParseError(ValueError):
    """Raised when a song file is malformed."""


def load_song(path: str | Path) -> Song:
    """Load and validate a song JSON file."""

    song_path = Path(path)
    try:
        raw_song = json.loads(song_path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise SongParseError(f"Song file not found: {song_path}") from exc
    except json.JSONDecodeError as exc:
        raise SongParseError(f"Invalid JSON in song file: {song_path}") from exc

    return parse_song(raw_song)


def parse_song(raw_song: dict[str, Any]) -> Song:
    """Validate raw song data and return a typed song."""

    if not isinstance(raw_song, dict):
        raise SongParseError("Song data must be a JSON object.")

    title = raw_song.get("title")
    if not isinstance(title, str) or not title.strip():
        raise SongParseError("Song title must be a non-empty string.")

    tempo_bpm = raw_song.get("tempo_bpm")
    if not isinstance(tempo_bpm, int) or tempo_bpm <= 0:
        raise SongParseError("tempo_bpm must be a positive integer.")

    raw_notes = raw_song.get("notes")
    if not isinstance(raw_notes, list) or not raw_notes:
        raise SongParseError("notes must be a non-empty list.")

    notes = tuple(_parse_note(raw_note, index) for index, raw_note in enumerate(raw_notes))
    return Song(title=title.strip(), tempo_bpm=tempo_bpm, notes=notes)


def _parse_note(raw_note: Any, index: int) -> Note:
    if not isinstance(raw_note, dict):
        raise SongParseError(f"Note {index} must be an object.")

    note_name = raw_note.get("note")
    if not isinstance(note_name, str) or not note_name.strip():
        raise SongParseError(f"Note {index} note must be a non-empty string.")

    start = raw_note.get("start")
    if not _is_number(start) or start < 0:
        raise SongParseError(f"Note {index} start must be a non-negative number.")

    duration = raw_note.get("duration")
    if not _is_number(duration) or duration <= 0:
        raise SongParseError(f"Note {index} duration must be a positive number.")

    return Note(note=note_name.strip(), start=float(start), duration=float(duration))


def _is_number(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool)

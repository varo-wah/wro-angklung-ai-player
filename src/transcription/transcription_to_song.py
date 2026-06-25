"""Convert transcription events into the internal song JSON format."""

from __future__ import annotations

import json
from pathlib import Path
import re
from typing import Any, Iterable

from src.transcription.mock_transcriber import MockNoteEvent


DEFAULT_IMPORTED_TEMPO_BPM = 120


def transcription_to_song_dict(
    title: str,
    note_events: Iterable[MockNoteEvent],
    tempo_bpm: int = DEFAULT_IMPORTED_TEMPO_BPM,
) -> dict[str, Any]:
    """Convert note events into the existing internal song JSON shape."""

    return {
        "title": title.strip(),
        "tempo_bpm": tempo_bpm,
        "notes": [
            {
                "note": event.note,
                "start": event.start_time_seconds,
                "duration": event.duration_seconds,
            }
            for event in sorted(note_events, key=lambda event: event.start_time_seconds)
        ],
    }


def write_internal_song(song_data: dict[str, Any], output_dir: str | Path = "songs/imported") -> Path:
    """Write internal song JSON using a slug derived from the song title."""

    output_directory = Path(output_dir)
    output_directory.mkdir(parents=True, exist_ok=True)
    output_path = output_directory / f"{slugify(str(song_data['title']))}.json"
    output_path.write_text(json.dumps(song_data, indent=2) + "\n", encoding="utf-8")
    return output_path


def slugify(value: str) -> str:
    """Return a filesystem-safe lowercase slug."""

    slug = re.sub(r"[^a-zA-Z0-9]+", "_", value.strip().lower()).strip("_")
    return slug or "imported_song"

"""Mock transcription output for proving the source ingestion pipeline."""

from __future__ import annotations

from dataclasses import dataclass

from src.song_sources.models import SourceInput


@dataclass(frozen=True)
class MockNoteEvent:
    """A mocked transcribed note event."""

    note: str
    start_time_seconds: float
    duration_seconds: float
    strength: float

    def to_dict(self) -> dict[str, float | str]:
        return {
            "note": self.note,
            "start_time_seconds": self.start_time_seconds,
            "duration_seconds": self.duration_seconds,
            "strength": self.strength,
        }


def transcribe_mock(source_input: SourceInput) -> tuple[MockNoteEvent, ...]:
    """Return deterministic mocked melody notes for a source."""

    _ = source_input
    return (
        MockNoteEvent(note="C4", start_time_seconds=0.0, duration_seconds=0.5, strength=0.8),
        MockNoteEvent(note="E4", start_time_seconds=0.5, duration_seconds=0.5, strength=0.8),
        MockNoteEvent(note="G4", start_time_seconds=1.0, duration_seconds=0.5, strength=0.8),
        MockNoteEvent(note="C5", start_time_seconds=1.5, duration_seconds=0.75, strength=0.8),
    )

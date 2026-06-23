"""Placeholder actuator controller for software-only playback."""

from __future__ import annotations

from src.instrument_mapper import InstrumentMapper
from src.note_scheduler import PlaybackEvent


class ActuatorController:
    """Software placeholder for future hardware-specific angklung control."""

    def __init__(self, instrument_mapper: InstrumentMapper) -> None:
        self._instrument_mapper = instrument_mapper

    def play_note(self, event: PlaybackEvent) -> None:
        """Print which angklung note should be played and when."""

        scheduled_note = event.scheduled_note
        mapping = self._instrument_mapper.resolve(scheduled_note.note)
        print(
            f"{scheduled_note.start:.3f}s | "
            f"note={scheduled_note.note} | "
            f"instrument={mapping.instrument_id} | "
            f"channel={mapping.actuator_channel} | "
            f"expected={event.expected_start_time:.3f}s | "
            f"actual={event.actual_start_time:.3f}s | "
            f"drift={event.drift_seconds:+.3f}s | "
            f"duration={scheduled_note.duration:.3f}s"
        )

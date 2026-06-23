"""Placeholder actuator controller for software-only playback."""

from __future__ import annotations

from src.note_scheduler import ScheduledNote


class ActuatorController:
    """Software placeholder for future hardware-specific angklung control."""

    def play_note(self, scheduled_note: ScheduledNote, actual_time: float) -> None:
        """Print which angklung note should be played and when."""

        timing_error = actual_time - scheduled_note.target_time
        print(
            f"Play angklung note {scheduled_note.note} "
            f"at {actual_time:.3f}s "
            f"(target {scheduled_note.target_time:.3f}s, "
            f"error {timing_error:+.3f}s, "
            f"duration {scheduled_note.duration:.3f}s)"
        )

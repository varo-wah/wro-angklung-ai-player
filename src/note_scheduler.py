"""Schedule parsed song notes against a monotonic clock."""

from __future__ import annotations

from dataclasses import dataclass
import time
from typing import Callable, Iterable

from src.song_parser import Note, Song


Clock = Callable[[], float]
Sleeper = Callable[[float], None]


@dataclass(frozen=True)
class ScheduledNote:
    """A note with an absolute monotonic target time."""

    note: str
    start: float
    duration: float
    target_time: float


@dataclass(frozen=True)
class PlaybackEvent:
    """A scheduled note with measured trigger timing."""

    scheduled_note: ScheduledNote
    expected_start_time: float
    actual_start_time: float
    drift_seconds: float


def build_schedule(song: Song, start_time: float) -> tuple[ScheduledNote, ...]:
    """Build a chronological schedule from a parsed song."""

    sorted_notes = sorted(song.notes, key=lambda note: note.start)
    return tuple(
        ScheduledNote(
            note=note.note,
            start=note.start,
            duration=note.duration,
            target_time=start_time + note.start,
        )
        for note in sorted_notes
    )


class NoteScheduler:
    """Run scheduled notes using injected clock, sleep, and play functions."""

    def __init__(
        self,
        clock: Clock = time.monotonic,
        sleeper: Sleeper = time.sleep,
    ) -> None:
        self._clock = clock
        self._sleeper = sleeper

    def play(
        self,
        scheduled_notes: Iterable[ScheduledNote],
        play_note: Callable[[PlaybackEvent], None],
    ) -> None:
        """Wait until each note's target time, then call `play_note`."""

        for scheduled_note in scheduled_notes:
            delay = scheduled_note.target_time - self._clock()
            if delay > 0:
                self._sleeper(delay)

            actual_start_time = self._clock()
            play_note(
                PlaybackEvent(
                    scheduled_note=scheduled_note,
                    expected_start_time=scheduled_note.target_time,
                    actual_start_time=actual_start_time,
                    drift_seconds=actual_start_time - scheduled_note.target_time,
                )
            )


def schedule_song(song: Song, start_delay_seconds: float = 0.0, clock: Clock = time.monotonic) -> tuple[ScheduledNote, ...]:
    """Build a schedule beginning after `start_delay_seconds` from the current clock."""

    if start_delay_seconds < 0:
        raise ValueError("start_delay_seconds must be non-negative.")

    start_time = clock() + start_delay_seconds
    return build_schedule(song, start_time)

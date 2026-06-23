import pytest

from src.note_scheduler import NoteScheduler, PlaybackEvent, ScheduledNote, build_schedule, schedule_song
from src.song_parser import Note, Song


def test_build_schedule_sorts_notes_and_adds_start_time() -> None:
    song = Song(
        title="Unsorted",
        tempo_bpm=120,
        notes=(
            Note(note="G4", start=1.0, duration=0.5),
            Note(note="C4", start=0.0, duration=0.5),
        ),
    )

    schedule = build_schedule(song, start_time=10.0)

    assert schedule == (
        ScheduledNote(note="C4", start=0.0, duration=0.5, target_time=10.0),
        ScheduledNote(note="G4", start=1.0, duration=0.5, target_time=11.0),
    )


def test_schedule_song_uses_clock_and_start_delay() -> None:
    song = Song(
        title="Clocked",
        tempo_bpm=120,
        notes=(Note(note="C4", start=0.25, duration=0.5),),
    )

    schedule = schedule_song(song, start_delay_seconds=1.5, clock=lambda: 20.0)

    assert schedule[0].target_time == 21.75


def test_scheduler_sleeps_until_each_note_and_calls_play() -> None:
    clock_values = iter([9.0, 10.0, 10.2, 11.0])
    sleeps: list[float] = []
    played: list[tuple[str, float]] = []

    scheduler = NoteScheduler(clock=lambda: next(clock_values), sleeper=sleeps.append)
    schedule = (
        ScheduledNote(note="C4", start=0.0, duration=0.5, target_time=10.0),
        ScheduledNote(note="E4", start=1.0, duration=0.5, target_time=11.0),
    )

    scheduler.play(schedule, lambda event: played.append((event.scheduled_note.note, event.actual_start_time)))

    assert sleeps == pytest.approx([1.0, 0.8])
    assert played == [("C4", 10.0), ("E4", 11.0)]


def test_scheduler_does_not_sleep_for_late_notes() -> None:
    sleeps: list[float] = []
    played: list[tuple[str, float]] = []
    scheduler = NoteScheduler(clock=lambda: 12.0, sleeper=sleeps.append)
    schedule = (ScheduledNote(note="C4", start=0.0, duration=0.5, target_time=10.0),)

    scheduler.play(schedule, lambda event: played.append((event.scheduled_note.note, event.actual_start_time)))

    assert sleeps == []
    assert played == [("C4", 12.0)]


def test_scheduler_reports_drift_from_expected_target_time() -> None:
    clock_values = iter([9.9, 10.25])
    events: list[PlaybackEvent] = []
    scheduler = NoteScheduler(clock=lambda: next(clock_values), sleeper=lambda delay: None)
    schedule = (ScheduledNote(note="C4", start=0.0, duration=0.5, target_time=10.0),)

    scheduler.play(schedule, events.append)

    assert events[0].expected_start_time == 10.0
    assert events[0].actual_start_time == 10.25
    assert events[0].drift_seconds == pytest.approx(0.25)


def test_scheduler_uses_absolute_targets_instead_of_accumulated_sleep() -> None:
    clock_values = iter([100.0, 100.7, 100.8, 101.05])
    sleeps: list[float] = []
    scheduler = NoteScheduler(clock=lambda: next(clock_values), sleeper=sleeps.append)
    schedule = (
        ScheduledNote(note="C4", start=0.0, duration=0.5, target_time=100.5),
        ScheduledNote(note="E4", start=0.5, duration=0.5, target_time=101.0),
    )

    scheduler.play(schedule, lambda event: None)

    assert sleeps == pytest.approx([0.5, 0.2])

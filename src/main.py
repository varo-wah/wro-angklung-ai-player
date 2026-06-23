"""Command-line entry point for software-only angklung playback."""

from __future__ import annotations

import argparse

from src.actuator_controller import ActuatorController
from src.config import DEFAULT_SONG_PATH, DEFAULT_START_DELAY_SECONDS
from src.note_scheduler import NoteScheduler, schedule_song
from src.song_parser import load_song


def main() -> None:
    parser = argparse.ArgumentParser(description="Run angklung song playback simulation.")
    parser.add_argument("song_path", nargs="?", default=DEFAULT_SONG_PATH)
    parser.add_argument(
        "--start-delay",
        type=float,
        default=DEFAULT_START_DELAY_SECONDS,
        help="Seconds to wait before the first scheduled note.",
    )
    args = parser.parse_args()

    song = load_song(args.song_path)
    scheduled_notes = schedule_song(song, start_delay_seconds=args.start_delay)

    print(f"Loaded '{song.title}' at {song.tempo_bpm} BPM with {len(song.notes)} notes.")
    print("Starting software-only playback simulation.")

    controller = ActuatorController()
    scheduler = NoteScheduler()
    scheduler.play(scheduled_notes, controller.play_note)


if __name__ == "__main__":
    main()

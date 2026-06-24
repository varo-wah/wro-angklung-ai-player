"""Command-line entry point for software-only angklung playback."""

from __future__ import annotations

import argparse
from pathlib import Path
import sys

if __package__ is None or __package__ == "":
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.actuator_controller import ActuatorController
from src.actuator_schedule import build_actuator_schedule
from src.config import DEFAULT_INSTRUMENT_MAP_PATH, DEFAULT_SONG_PATH, DEFAULT_START_DELAY_SECONDS
from src.instrument_mapper import load_instrument_mapper
from src.note_scheduler import NoteScheduler, schedule_song
from src.song_parser import load_song


def main() -> None:
    parser = argparse.ArgumentParser(description="Run angklung song playback simulation.")
    parser.add_argument("song_path", nargs="?", help="Path to song JSON. Use --song for explicit driver mode.")
    parser.add_argument("--song", dest="song_option", help="Path to song JSON.")
    parser.add_argument(
        "--driver",
        choices=("terminal", "json"),
        default="terminal",
        help="Output driver to use.",
    )
    parser.add_argument("--export", help="Output path for --driver json.")
    parser.add_argument(
        "--instrument-map",
        default=DEFAULT_INSTRUMENT_MAP_PATH,
        help="Path to note-to-instrument mapping JSON.",
    )
    parser.add_argument(
        "--start-delay",
        type=float,
        default=DEFAULT_START_DELAY_SECONDS,
        help="Seconds to wait before the first scheduled note.",
    )
    args = parser.parse_args()

    song_path = args.song_option or args.song_path or DEFAULT_SONG_PATH
    if args.driver == "json" and not args.export:
        parser.error("--export is required when --driver json is used.")

    song = load_song(song_path)
    instrument_mapper = load_instrument_mapper(args.instrument_map)
    instrument_mapper.validate_song(song)

    if args.driver == "json":
        schedule = build_actuator_schedule(song, instrument_mapper)
        schedule.write_json(Path(args.export))
        print(f"Exported actuator schedule to {args.export}")
        return

    scheduled_notes = schedule_song(song, start_delay_seconds=args.start_delay)

    print(f"Loaded '{song.title}' at {song.tempo_bpm} BPM with {len(song.notes)} notes.")
    print("Starting software-only playback simulation.")

    controller = ActuatorController(instrument_mapper)
    scheduler = NoteScheduler()
    scheduler.play(scheduled_notes, controller.play_note)


if __name__ == "__main__":
    main()

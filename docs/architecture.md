# Architecture

## Goal

Build a reliable software pipeline that can later control a physical angklung-playing robot.

The first milestone focuses on deterministic note scheduling. Hardware control is intentionally abstracted behind a placeholder actuator layer.

## Components

### Song Parser

`src/song_parser.py` loads a JSON song file and validates its structure.

Responsibilities:

- Read song metadata.
- Validate tempo and note fields.
- Reject invalid note timings, durations, or names.
- Return a typed `Song` object.

### Note Scheduler

`src/note_scheduler.py` converts parsed notes into scheduled playback events.

Responsibilities:

- Sort notes by start time.
- Convert relative song offsets into absolute monotonic-clock target times.
- Keep scheduling separate from hardware behavior.

### Actuator Controller

`src/actuator_controller.py` is a software placeholder.

Responsibilities:

- Print which angklung note should be played.
- Preserve the control boundary where hardware-specific code will later be added.

### Main Entry Point

`src/main.py` wires the parser, scheduler, and actuator controller together for local playback simulation.

## Timing Strategy

The scheduler uses `time.monotonic()` rather than wall-clock time. Wall-clock time can shift due to system time updates, while monotonic time is appropriate for measuring elapsed playback time.

The current scheduler sleeps until each event's target time. This is adequate for the software milestone, but hardware testing may require measuring jitter and moving time-sensitive output to a microcontroller.

## Design Constraint

Do not add hardware-specific control until software timing and scheduling behavior are tested and repeatable.

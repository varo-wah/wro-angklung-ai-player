# Roadmap

## Milestone 1: Software Timing And Scheduling

Status: in progress.

Deliverables:

- JSON song format.
- Song parser with validation.
- Deterministic note scheduling.
- Placeholder actuator playback.
- Tests for parsing and scheduling.

Success criteria:

- Invalid song files fail clearly.
- Notes are scheduled in chronological order.
- Scheduled times are based on monotonic time.
- Playback simulation can run without hardware.

## Milestone 2: Timing Measurement

Deliverables:

- Playback jitter logging.
- Scheduler tolerance checks.
- Stress tests with chords and fast passages.
- Reported timing accuracy on target machine.

## Milestone 3: Hardware Interface Prototype

Deliverables:

- Replace print actuator with a controlled hardware adapter.
- Define note-to-actuator mapping.
- Add dry-run mode.
- Add emergency stop behavior.

## Milestone 4: Full Angklung Playback

Deliverables:

- Reliable physical playback of simple songs.
- Calibration for actuator delay.
- Handling for simultaneous notes.
- Demonstration song for WRO presentation.

## Milestone 5: AI Assistance

Deliverables:

- Song recommendation or generation pipeline.
- Conversion from AI output into validated song JSON.
- Human review step before playback.

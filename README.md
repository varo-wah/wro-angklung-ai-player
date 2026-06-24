# WRO Angklung AI Player

This repository contains the software foundation for a WRO robotics project: an AI-assisted angklung player.

The system will read structured song data, schedule notes with reliable timing, and eventually drive hardware actuators that shake individual angklung instruments. The first milestone is intentionally software-only: prove that song parsing and note scheduling are predictable before attaching real motors, servos, or microcontroller interfaces.

## Current Milestone

Reliable software timing and note scheduling.

The current implementation:

- Loads songs from JSON files.
- Validates note timing and duration.
- Converts relative note timings into scheduled playback events.
- Uses placeholder actuator functions that print which note should be played and when.

Hardware-specific control is not implemented yet. That boundary is deliberate; actuator logic should only be added after the parser and scheduler are proven stable.

## Project Layout

```text
config/
  instrument_map.json
docs/
  architecture.md
  hardware.md
  software.md
  roadmap.md
hardware/
  parts_list.md
  wiring.md
songs/
  example_song.json
src/
  actuator_controller.py
  config.py
  instrument_mapper.py
  main.py
  note_scheduler.py
  song_parser.py
tests/
  test_instrument_mapper.py
  test_note_scheduler.py
  test_song_parser.py
```

## Run the Example

```bash
python3 -m src.main songs/example_song.json
```

## Export Actuator Schedule JSON

```bash
python3 src/main.py --song songs/example_song.json --driver json --export outputs/example_schedule.json
```

## Run The Website Simulator

```bash
cd frontend
npm install
npm run dev
```

Open the local Next.js URL, upload `outputs/example_schedule.json`, then use the playback controls to simulate the angklung rack.

## Run Tests

```bash
python3 -m pytest
```

If `pytest` is not installed:

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python -m pytest
```

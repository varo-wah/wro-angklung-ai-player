# WRO Angklung AI Player

This repository contains the software foundation for a WRO robotics project: an AI-assisted angklung player.

The official build order is now:

1. Phase 1: Angklung Website / Control UI first.
2. Phase 2: Simple built-in songs playback.
3. Phase 3: YouTube link piano-to-angklung converter.
4. Phase 4: Optional automatic YouTube search later.

The project still targets direct YouTube Piano Reference Mode later: a user or judge provides a simple piano reference link, the system normalizes it into internal song JSON, exports `actuator_schedule.v1`, and later sends that schedule to the website simulator or real robot.

For now, YouTube search, real YouTube audio download, and real audio transcription are not implemented. The current source pipeline uses mocked transcription so the architecture can be tested before adding fragile external audio dependencies.

## Current Milestone

Reliable software timing and note scheduling.

The current implementation:

- Loads songs from JSON files.
- Validates note timing and duration.
- Models the physical rack as 18 diatonic angklung notes from `G4` through `C7`.
- Converts relative note timings into scheduled playback events.
- Imports a YouTube URL through a mocked transcription pipeline.
- Converts mocked transcription notes into internal song JSON.
- Exports official `actuator_schedule.v1` JSON.
- Provides a website performance console with built-in songs, schedule generation, validation, simulation playback, and advanced JSON upload.
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
  actuator_schedule.py
  config.py
  instrument_mapper.py
  main.py
  note_scheduler.py
  song_parser.py
  song_sources/
  transcription/
tests/
  test_actuator_schedule.py
  test_instrument_mapper.py
  test_note_scheduler.py
  test_song_sources.py
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

## Import A YouTube Piano Reference

This currently validates the YouTube URL and uses mocked transcription. It does not download from YouTube yet.

```bash
.venv/bin/python -m src.song_sources.process_source --source-type youtube_url --url "https://youtube.com/watch?v=example" --title "Example Song"
```

That creates:

```text
songs/imported/example_song.json
```

Then export it to the actuator schedule format:

```bash
.venv/bin/python src/main.py --song songs/imported/example_song.json --driver json --export outputs/example_schedule.json
```

## Run The Website Simulator

```bash
cd frontend
npm install
npm run dev
```

Open the local Next.js URL. The Phase 1 console can generate and play built-in songs directly:

- Twinkle Twinkle
- Happy Birthday
- Ode to Joy

The advanced upload section still accepts `outputs/example_schedule.json`.

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

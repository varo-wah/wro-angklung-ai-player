# WRO Angklung AI Player

This repository contains the software foundation for a WRO robotics project: a website-based AI Angklung Performance Console.

The official build order is now:

1. Phase 1: Website/control UI and chatbot-style assistant.
2. Phase 2: Reliable preloaded song library and simple song playback.
3. Phase 3: YouTube Piano Reference Mode with user approval.
4. Phase 4: Optional automatic YouTube search plus camera/voice interaction.
5. Phase 5: Hardware driver using the same `actuator_schedule.v1` format.

The project claim is deliberately narrow: preloaded supported songs are reliable. If a request is not preloaded, future YouTube Piano Reference Mode may search for a simple piano reference, ask the user to approve it, and attempt conversion only if the melody fits the current angklung rack.

For now, YouTube search, real YouTube audio download, real audio transcription, camera detection, voice input, and hardware motor control are not implemented. The website shows that path as a disabled/mock workflow so the product direction is visible without pretending the conversion is ready.

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
- Provides a three-screen website: a visitor-facing Guest Interface, an operator-facing Control Panel, and an audience-facing Display Screen.
- Shares song requests, schedule generation, validation, playback state, and rack animation between the screens.
- Uses browser-based `BroadcastChannel` plus `localStorage` sync so multiple same-browser tabs can stay aligned during Phase 1 demos without a backend database.
- Uses placeholder actuator functions that print which note should be played and when.
- Rejects unsupported song requests safely instead of claiming arbitrary-song playback.

The modeled frontend rack is the 2.5-octave diatonic range defined in `frontend/src/lib/instrumentMap.ts`. Songs containing unsupported notes such as sharps/flats must be rejected unless a future simplification step can convert them safely into that range.

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

Open the local Next.js URL. `/` redirects to the visitor-facing Guest Interface:

- `/guest`: chatbot-style screen for visitors requesting songs.
- `/control`: technical console showing schedule generation, validation, playback, virtual rack behavior, timeline, JSON preview, and advanced upload.
- `/display`: presentation screen for an audience monitor, showing assistant status, current request, now-playing state, and a decorative music sheet preview.

During Phase 1, these screens use browser-tab synchronization through `BroadcastChannel` with `localStorage` hydration. A tab opened after a song is selected can restore the latest request, schedule, validation, playback status, and display state. The tab that starts playback owns the browser audio; other tabs mirror visual playback state to avoid multiple screens playing sound at once.

The Guest Interface can accept chatbot-style song requests:

- Twinkle Twinkle
- Happy Birthday
- Ode to Joy

The workflow is:

```text
guest requests song -> system checks supported library -> if found, actuator_schedule.v1 is generated -> validation runs -> guest can play -> control panel shows the internal process
```

Unsupported song requests show the Phase 3 YouTube Piano Reference Mode placeholder. No download, search, transcription, or motor command is started from that placeholder.

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

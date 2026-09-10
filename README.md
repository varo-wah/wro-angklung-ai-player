# WRO Angklung AI Player

For the current Mac Chrome USB controller, paired phone controls, shared connection status, and recovery procedure, see [Operating configuration](docs/operating-configuration.md). The older milestone descriptions below have not yet been fully reconciled with the current full-rack implementation.

This repository contains the software foundation for a WRO robotics project: a website-based AI Angklung Performance Console.

The official build order is now:

1. Phase 1: Website/control UI and chatbot-style assistant.
2. Phase 2: Reliable preloaded song library and simple song playback.
3. Phase 3: YouTube Piano Reference Mode with user approval.
4. Phase 4: Local Safari voice interaction, followed by optional automatic YouTube search and camera interaction.
5. Phase 5: Hardware driver using the same `actuator_schedule.v1` format.

The project claim is deliberately narrow: preloaded supported songs are reliable. If a request is not preloaded, future YouTube Piano Reference Mode may search for a simple piano reference, ask the user to approve it, and attempt conversion only if the melody fits the current angklung rack.

For now, YouTube search, real YouTube audio download, song-audio transcription, and camera detection are not implemented. A supervised four-note Arduino Mega trial can receive the website's validated schedule over Web Serial; full-rack hardware control is not implemented. Guest conversation voice input is available through a Mac-local `whisper.cpp` service; it does not turn arbitrary recordings into playable songs.

## Current Milestone

Reliable software timing and note scheduling.

The current implementation:

- Loads songs from JSON files.
- Validates note timing and duration.
- Models the physical rack as 18 diatonic angklung notes from `G3` through `C6`.
- Converts relative note timings into scheduled playback events.
- Imports a YouTube URL through a mocked transcription pipeline.
- Converts mocked transcription notes into internal song JSON.
- Exports official `actuator_schedule.v1` JSON.
- Provides a three-screen website: a visitor-facing Guest Interface, an operator-facing Control Panel, and an audience-facing Display Screen.
- Shares song requests, schedule generation, validation, playback state, and rack animation between the screens.
- Uses browser-based `BroadcastChannel` plus `localStorage` sync so multiple same-browser tabs can stay aligned during Phase 1 demos without a backend database.
- Uses placeholder actuator functions that print which note should be played and when.
- Rejects unsupported song requests safely instead of claiming arbitrary-song playback.
- Accepts English or Indonesian guest speech in Safari and speaks the assistant's final response using macOS voices.

Phase 2 testing currently uses `A Whole New World` and `Perfect MuseScore Ver.` as active G3-C6 draft arrangements. `Perfect` remains in the catalog as an inactive draft because it still uses the old G4-C7 software rack and must be remapped before playback.

The modeled frontend rack is the G3-C6 diatonic range defined in `frontend/src/lib/instrumentMap.ts`. Songs containing unsupported notes such as sharps/flats must be rejected unless a future simplification step can convert them safely into that range.

Hardware-specific control remains limited to the supervised low-register G3/B3/D4/F4 trial. The Control page can connect to `hardware/arduino/mega_low_5724_trial/mega_low_5724_trial.ino` over USB and send validated commands to the supplied Arduino Mega pin pairs. This does not certify the external drivers, actuator power, or physical emergency stop and does not enable the other 14 rack channels.

## Arduino Website Trial

1. Upload `hardware/arduino/mega_low_5724_trial/mega_low_5724_trial.ino` to the Arduino Mega at 115200 baud.
2. Close Arduino Serial Monitor so it releases the USB port.
3. Start the website on `localhost` and open `/control` in Chrome or Edge.
4. Select **Connect Arduino**, choose the board, load one of the low 5-7-2-4 hardware trials, and use the main Play control.

The configured mapping is numbered 5/G3 channel 0 to pins 6+7, 7/B3 channel 2 to pins 8+9, 2/D4 channel 4 to pins 10+11, and 4/F4 channel 6 to pins 12+13. Pause, Stop, completion, and disconnect command all outputs LOW; E-Stop also disarms firmware output. See `hardware/arduino/README.md` for protocol and supervised bring-up details.

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

## MacBook Safari Voice Setup

Voice input uses Safari microphone capture and a loopback-only `whisper.cpp` server. Audio is normalized to a short 16 kHz WAV recording in the browser, sent only to `127.0.0.1`, transcribed, and discarded. Spoken replies use Safari's built-in speech synthesis.

Requirements:

- macOS with Safari 14.1 or newer; a current Safari release is recommended.
- `git` and `cmake` available in Terminal.
- About 500 MB of free memory and 150 MB of model storage for the default multilingual `base` model.

Install the pinned local voice engine once:

```bash
scripts/setup_voice_macos.sh
```

Start the transcription service in one Terminal window:

```bash
scripts/start_voice_macos.sh
```

Start the website in a second Terminal window:

```bash
cd frontend
npm run dev
```

Open `http://localhost:3000/guest` in Safari, select English or Bahasa Indonesia, and press **Mic**. Allow microphone access when Safari asks. The control stops automatically after roughly 1.2 seconds of silence or after 15 seconds.

Important operating behavior:

- Starting the microphone cancels speech output and pauses simulated music to prevent feedback.
- Music does not automatically resume after a voice request.
- Voice transcripts use the same catalog, confirmation, schedule validation, and playback-command routes as typed requests.
- Typed chat remains available when the microphone or local transcription service is unavailable.
- When serving the site from anything other than `localhost`, Safari requires HTTPS for microphone access.

Optional configuration:

```bash
ANGKLOBOT_WHISPER_MODEL=small scripts/setup_voice_macos.sh
ANGKLOBOT_WHISPER_MODEL=small scripts/start_voice_macos.sh
ANGKLOBOT_WHISPER_THREADS=6 scripts/start_voice_macos.sh
```

The multilingual `small` model is a larger optional accuracy upgrade. Both models should be tested for Indonesian accuracy and latency in the actual competition environment. The local service URL defaults to `http://127.0.0.1:8080` and can be changed for the Next.js server with `WHISPER_SERVER_URL`.

### Optional local “Hey Angklobot” mode

The Guest page includes an optional “Hey Angklobot” toggle using short browser microphone recordings and the existing local Whisper server. Enable it, say the wake phrase by itself, then wait for “Listening to command” before speaking your request. No custom model, training, access key, or separate wake-word service is required. The openWakeWord training path is paused. The existing Mic button remains available. See [local setup, matching rules, limitations, and tests](docs/wakeword-macos.md).

The Guest Interface can accept chatbot-style song requests:

- A Whole New World
- Perfect MuseScore Ver.

The workflow is:

```text
guest requests A Whole New World -> system checks supported library -> G3-C6 layered MIDI-derived draft is loaded -> actuator_schedule.v1 is generated -> validation runs -> guest can test playback if validation does not fail
```

Unsupported song requests show the Phase 3 YouTube Piano Reference Mode placeholder. No download, search, transcription, or motor command is started from that placeholder.

The active catalog is `frontend/public/songs/catalog.json`. Current arrangement source files are `frontend/public/songs/arrangements/perfect.json`, `frontend/public/songs/arrangements/a_whole_new_world.json`, and `frontend/public/songs/arrangements/perfect_musescore_ver.json`. `Perfect` is marked inactive with `arrangement_status: needs_remap_to_g3_c6`. `A Whole New World` and `Perfect MuseScore Ver.` are marked `demo_safe: false` and remain draft arrangements for simulator and display testing only.

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

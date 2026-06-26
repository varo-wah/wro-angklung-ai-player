# Software

## Current Target

The software target is reliable control flow before any physical actuator is connected.

The official build order is:

1. Phase 1: Angklung Website / Control UI first.
2. Phase 2: Simple built-in songs playback.
3. Phase 3: YouTube link piano-to-angklung converter.
4. Phase 4: Optional automatic YouTube search later.

The current pipeline is:

```text
YouTube URL -> mocked transcription -> internal song JSON -> actuator_schedule.v1
song JSON -> song parser -> instrument mapper -> note scheduler -> actuator controller placeholder
built-in frontend song -> actuator_schedule.v1 -> website simulator
```

The YouTube path is architecture preparation only. It validates source input and produces deterministic mocked notes; it does not search YouTube, download audio, or perform real transcription.

## Song Format

Songs are JSON objects with metadata and a list of notes:

```json
{
  "title": "Example Angklung Pattern",
  "tempo_bpm": 120,
  "notes": [
    {"note": "G4", "start": 0.0, "duration": 0.5}
  ]
}
```

Fields:

- `title`: human-readable song name.
- `tempo_bpm`: positive integer tempo metadata.
- `notes`: non-empty list of note events.
- `note`: angklung note name.
- `start`: note start time in seconds from the beginning of playback.
- `duration`: intended note duration in seconds.

## Timing Model

The scheduler uses monotonic time. This is the correct clock for elapsed-time playback because it is not affected by wall-clock updates.

The scheduler currently:

- Sorts notes by `start`.
- Converts relative note starts into absolute monotonic target times.
- Sleeps until each target time.
- Calls the actuator boundary with expected start time, actual start time, and drift.

## Instrument Mapping

Instrument mappings are stored in `config/instrument_map.json`.

The current physical range is modeled as 18 diatonic notes:

```text
G4 A4 B4 C5 D5 E5 F5
G5 A5 B5 C6 D6 E6 F6
G6 A6 B6 C7
```

Each playable note must resolve to:

- `instrument_id`: the physical angklung identifier.
- `actuator_channel`: the placeholder channel that will later correspond to hardware routing.

Playback fails before scheduling if any song note is missing from the map. Partial playback is not allowed at this stage.

## Actuator Schedule Export

The official command export format is `actuator_schedule.v1`.

Generate an actuator schedule JSON file with:

```bash
python3 src/main.py --song songs/example_song.json --driver json --export outputs/example_schedule.json
```

The export is relative to playback start and is intended for the future website, simulator, and hardware controller layers.

## Website Simulator

The frontend simulator lives in `frontend/`.

It now acts as the Phase 1 AI Angklung Performance Console. It supports built-in song selection, arrangement controls, schedule generation, validation, virtual angklung playback, oscillator tones, timeline preview, JSON preview, and advanced `actuator_schedule.v1` upload.

Run it with:

```bash
cd frontend
npm install
npm run dev
```

## Testing

Run tests with:

```bash
python3 -m pytest
```

If using the local virtual environment created during setup:

```bash
.venv/bin/python -m pytest
```

## Known Limits

- No hardware control is implemented.
- Drift is reported in terminal output, but it is not persisted yet.
- Simultaneous notes are scheduled sequentially in sorted order.
- Tempo is stored as metadata, but notes currently use seconds rather than beats.

# Software

## Current Target

The software target is reliable note parsing and scheduling before any physical actuator is connected.

The current pipeline is:

```text
song JSON -> song parser -> instrument mapper -> note scheduler -> actuator controller placeholder
```

## Song Format

Songs are JSON objects with metadata and a list of notes:

```json
{
  "title": "Example Angklung Pattern",
  "tempo_bpm": 120,
  "notes": [
    {"note": "C4", "start": 0.0, "duration": 0.5}
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

It supports uploading an `actuator_schedule.v1` JSON file, validates required command fields, renders a virtual angklung rack, plays oscillator tones, animates matching instruments, and shows both a timeline table and JSON preview.

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

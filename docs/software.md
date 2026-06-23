# Software

## Current Target

The software target is reliable note parsing and scheduling before any physical actuator is connected.

The current pipeline is:

```text
song JSON -> song parser -> note scheduler -> actuator controller placeholder
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
- Calls the actuator boundary with the scheduled note and actual trigger time.

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
- No jitter measurement is recorded yet.
- Simultaneous notes are scheduled sequentially in sorted order.
- Tempo is stored as metadata, but notes currently use seconds rather than beats.

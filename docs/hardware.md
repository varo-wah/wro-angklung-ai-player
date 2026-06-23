# Hardware

## Current Status

Hardware-specific control is not implemented.

The software currently uses placeholder actuator functions that print the note and scheduled playback time. This allows timing and song logic to be tested without risking hardware damage or hiding software defects behind mechanical issues.

## Expected Hardware Direction

Future hardware work may include:

- One actuator per angklung note.
- A motor driver, servo driver, relay board, or solenoid driver depending on the final mechanism.
- A microcontroller for precise low-level timing.
- A host computer or single-board computer for AI-assisted song selection and high-level scheduling.

## Hardware Boundary

Hardware code should enter through `src/actuator_controller.py`.

The rest of the system should not know whether a note is played by:

- A print statement.
- A GPIO pin.
- A serial command.
- A microcontroller protocol.

This boundary keeps scheduling testable and prevents hardware experiments from destabilizing core playback logic.

## Risks To Validate Later

- Mechanical response delay.
- Actuator reset time.
- Missed or overlapping notes.
- Power draw during chords.
- Timing jitter between host software and physical movement.
- Angklung resonance and damping behavior.

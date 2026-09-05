# Hardware

## Current Status

The Python pipeline still uses placeholder actuator functions. The website Web Serial driver now supports the complete 18-note G3-C6 rack. It sends validated `actuator_schedule.v1` commands to the Arduino Mega firmware and commands all outputs off for Pause, Stop, completion, and disconnect. E-Stop also disarms firmware output.

The canonical mapping and bring-up procedure are in `hardware/arduino/README.md`. Firmware uses non-blocking software PWM on the first pin of every driver pair, so ordinary Mega digital pins remain power-adjustable. The implementation is software-validated only until the exact wiring, drivers, power system, firmware upload, and each physical actuator are tested.

## Expected Hardware Direction

Future hardware work may include:

- One actuator per angklung note.
- A motor driver, servo driver, relay board, or solenoid driver depending on the final mechanism.
- A microcontroller for precise low-level timing.
- A host computer or single-board computer for AI-assisted song selection and high-level scheduling.

## Hardware Boundary

Python hardware code should enter through `src/actuator_controller.py`. Browser-operated hardware code enters through `frontend/src/lib/arduinoSerial.ts` and the versioned serial protocol in `hardware/arduino/mega_full_18_note/mega_full_18_note.ino`.

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

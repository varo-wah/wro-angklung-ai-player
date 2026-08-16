# Hardware

## Current Status

The Python pipeline still uses placeholder actuator functions. The website now has a narrow Web Serial trial driver for Do/C5, Mi/E5, and Sol/G5 only. It sends the existing validated `actuator_schedule.v1` commands to the Arduino fallback firmware and commands all outputs off for Pause, Stop, completion, and disconnect. E-Stop also disarms firmware output.

The current logical-to-pin-pair mapping is C5 channel 10 to pins 11+12, E5 channel 12 to pins 9+10, and G5 channel 14 to pins 3+5. The firmware drives pins 11, 9, and 3 with PWM while holding pins 12, 10, and 5 LOW. Full-rack hardware control and physical certification remain incomplete.

## Expected Hardware Direction

Future hardware work may include:

- One actuator per angklung note.
- A motor driver, servo driver, relay board, or solenoid driver depending on the final mechanism.
- A microcontroller for precise low-level timing.
- A host computer or single-board computer for AI-assisted song selection and high-level scheduling.

## Hardware Boundary

Python hardware code should enter through `src/actuator_controller.py`. Browser-operated trial code enters through `frontend/src/lib/arduinoSerial.ts` and the versioned serial protocol in `hardware/arduino/do_mi_sol_fallback/do_mi_sol_fallback.ino`.

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

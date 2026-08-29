# Hardware

## Current Status

The Python pipeline still uses placeholder actuator functions. The website now has a narrow Web Serial trial driver for numbered angklungs 5, 7, 2, and 4, interpreted as G3, B3, D4, and F4 on the G3-C6 rack. It sends validated `actuator_schedule.v1` commands to the Arduino Mega firmware and commands all outputs off for Pause, Stop, completion, and disconnect. E-Stop also disarms firmware output.

The current mapping is G3 channel 0 to pins 6+7, B3 channel 2 to pins 8+9, D4 channel 4 to pins 10+11, and F4 channel 6 to pins 12+13. The firmware drives pins 6, 8, 10, and 12 with PWM while holding pins 7, 9, 11, and 13 LOW. Full-rack hardware control and physical certification remain incomplete.

## Expected Hardware Direction

Future hardware work may include:

- One actuator per angklung note.
- A motor driver, servo driver, relay board, or solenoid driver depending on the final mechanism.
- A microcontroller for precise low-level timing.
- A host computer or single-board computer for AI-assisted song selection and high-level scheduling.

## Hardware Boundary

Python hardware code should enter through `src/actuator_controller.py`. Browser-operated trial code enters through `frontend/src/lib/arduinoSerial.ts` and the versioned serial protocol in `hardware/arduino/mega_low_5724_trial/mega_low_5724_trial.ino`.

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

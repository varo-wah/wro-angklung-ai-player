# Arduino Mega Web Serial Hardware

The Control website sends validated `actuator_schedule.v1` commands directly to an Arduino Mega 2560 over USB. The browser owns musical timing. The full-rack firmware owns output safety, pulse expiry, and non-blocking software PWM for all 18 motors.

## Canonical full-rack firmware

Upload `mega_full_18_note/mega_full_18_note.ino` for the physical 18-angklung rack. The older `mega_low_5724_trial/` sketch remains as a historical four-note fallback and is not the current rack firmware.

| Channel | Pitch | Angklung number | IN1 / software PWM | IN2 / LOW |
| ---: | --- | ---: | ---: | ---: |
| 0 | G3 | 5 | 8 | 9 |
| 1 | A3 | 6 | 6 | 7 |
| 2 | B3 | 7 | 4 | 5 |
| 3 | C4 | 1 | 2 | 3 |
| 4 | D4 | 2 | 28 | 29 |
| 5 | E4 | 3 | 26 | 27 |
| 6 | F4 | 4 | 32 | 33 |
| 7 | G4 | 5 | 30 | 31 |
| 8 | A4 | 6 | 12 | 13 |
| 9 | B4 | 7 | 10 | 11 |
| 10 | C5 | 1 | 24 | 25 |
| 11 | D5 | 2 | 22 | 23 |
| 12 | E5 | 3 | 38 | 39 |
| 13 | F5 | 4 | 36 | 37 |
| 14 | G5 | 5 | 42 | 43 |
| 15 | A5 | 6 | 40 | 41 |
| 16 | B5 | 7 | 46 | 47 |
| 17 | C6 | 1 | 44 | 45 |

Repeated traditional numbers are labels, not hardware addresses. Website and firmware control always use the unique actuator channel `0` through `17`.

The first pin is driven by software PWM with an approximately 1000 microsecond period; the second remains LOW during forward activation. Stopped motors have both pins LOW. The editable `motorPowerPercent[18]` and `motorPulseMs[18]` arrays start every channel at 20% and 120 ms. Runtime calibration changes stay in RAM and reset to these compiled defaults whenever the Mega restarts.

Website NOTE strength is scaled against the channel's current `motorPowerPercent` ceiling. For example, strength 800 with a 20% calibration produces a 16% software-PWM duty cycle. Website duration remains independently requested and capped at 180 ms; `motorPulseMs` is used by `TEST`.

## Protocol v1

All messages are newline-delimited ASCII at 115200 baud. Commands are case-insensitive.

```text
Browser -> HELLO,1
Mega    -> READY,1,ACTIVE
Browser -> ARM
Mega    -> ACK,ARM
Browser -> ALL_OFF
Mega    -> ACK,ALL_OFF
Browser -> NOTE,0,180,800
Mega    -> ACK,NOTE,0
Browser -> DISARM
Mega    -> ACK,DISARM
```

Supported commands:

- `HELLO,1`: verifies protocol compatibility without arming or moving anything.
- `ARM`: enables subsequent `NOTE` and `TEST` commands; it first forces all outputs LOW.
- `NOTE,<channel>,<duration_ms>,<strength>`: accepts channels 0-17, duration 1-5000 ms, and strength 0-1000. Physical activation remains capped at 180 ms.
- `TEST,<channel>`: while armed, activates exactly one channel with its current calibrated power and pulse duration. It responds `ACK,TEST,<channel>,POWER=<percent>,PULSE=<ms>`.
- `POWER,<channel>,<percent>`: changes one RAM-only power ceiling without activating a motor. Accepted range: 0-60%.
- `PULSE,<channel>,<milliseconds>`: changes one RAM-only TEST duration without activating a motor. Accepted range: 50-180 ms; the earlier 180 ms safety cap is intentionally stricter than the proposed 250 ms calibration ceiling.
- `CAL,<channel>`: prints that channel's note, live power, live pulse, IN1, and IN2 values.
- `CALALL`: first stops all active pulses, then prints all 18 calibration records in channel order for copying back into source. It retains the armed state.
- `ALL_OFF` (or compatibility alias `STOP`): immediately forces both pins LOW on every channel while retaining the armed state.
- `DISARM` (or compatibility alias `ESTOP`): immediately forces all pins LOW and rejects further NOTE/TEST commands until ARM.
- `STATUS`: reports readiness, armed state, protocol 1, and `FULL_18_CHANNEL` mode.

Malformed fields, channels outside 0-17, durations outside 1-5000 ms, strengths outside 0-1000, protocol mismatches, overlong commands, and activation attempts while disarmed return `ERROR,...` and do not activate a motor.

## Safe bring-up

1. Disconnect or switch off the separate actuator power supply. Leave the Mega connected only by USB.
2. Verify every IN1/IN2 wire against the table and the motor driver's truth table. Confirm a common signal ground, flyback protection for inductive loads, suitable fusing, and a physical actuator-power cutoff.
3. Upload `mega_full_18_note/mega_full_18_note.ino` with **Arduino Mega or Mega 2560** selected.
4. In Serial Monitor at 115200 baud with **Newline** enabled, send `STATUS`; expect `STATUS,READY,PROTOCOL=1,MODE=FULL18,ARMED=FALSE`. CRLF input is also handled safely.
5. Send `HELLO,1`, `ARM`, `NOTE,0,180,800`, `ALL_OFF`, and `DISARM` while actuator power remains off. Verify acknowledgements only; no movement can be inferred from serial responses.
6. Close Serial Monitor so it releases the USB port. Start the website from `frontend/`, then open `/control` in desktop Chrome or Edge on localhost or HTTPS.
7. Select **Connect Arduino**, choose the Mega, and confirm the website reports an active connection. Connect alone and ARM alone must cause no movement.
8. Before powering actuators, use `STATUS` again if the USB connection has reset the board; a reset always returns to disarmed.

For powered testing, isolate the mechanism and keep hands clear. Begin with channel 0 only: `ARM`, `CAL,0`, `TEST,0`, then `ALL_OFF`. Adjust with `POWER,0,<0-60>` and `PULSE,0,<50-180>`, testing after one change at a time. Repeat for channels 1-17, issue `CALALL` to capture the final RAM values, then `DISARM`. Use the physical cutoff immediately for unexpected motion. Do not start a song until all 18 individual channels have been identified and safely calibrated.

Arduino GPIO must never directly power a motor. Software arming is not a substitute for a physical actuator-power emergency stop.

# Canonical USB Web Serial setup — 18 notes

Upload `mega_full_18_note_web_serial/mega_full_18_note_web_serial.ino` to an Arduino Mega 2560. This is the canonical sketch for the supplied September 6 mapping. Older sketches and their calibration are retained for history. ESP32, Wi-Fi and Bluetooth are NOT part of this USB setup.

**Physical blocker:** pin 42 is shared by G5 IN2 and C6 IN1. C6 PWM necessarily drives G5's direction input; independent one-direction operation is impossible with that shared wire. The exact supplied map is preserved. Verify and resolve the actual wiring before powered full-rack playback; a software test cannot certify it.

| Channel | Note | Physical number | IN1 PWM | IN2 LOW |
| ---: | --- | ---: | ---: | ---: |
| 0 | G3 | 5 | 6 | 7 |
| 1 | A3 | 6 | 8 | 9 |
| 2 | B3 | 7 | 2 | 3 |
| 3 | C4 | 1 | 4 | 5 |
| 4 | D4 | 2 | 28 | 29 |
| 5 | E4 | 3 | 26 | 27 |
| 6 | F4 | 4 | 32 | 33 |
| 7 | G4 | 5 | 30 | 31 |
| 8 | A4 | 6 | 12 | 14 |
| 9 | B4 | 7 | 10 | 11 |
| 10 | C5 | 1 | 24 | 25 |
| 11 | D5 | 2 | 22 | 23 |
| 12 | E5 | 3 | 36 | 37 |
| 13 | F5 | 4 | 34 | 35 |
| 14 | G5 | 5 | 41 | 42 |
| 15 | A5 | 6 | 38 | 39 |
| 16 | B5 | 7 | 44 | 45 |
| 17 | C6 | 1 | 42 | 43 |

Software PWM period is 1000 µs. Each channel uses the calibrated power table and a 550 ms manual TEST pulse. Website duration is authoritative up to the current 5000 ms physical cap. Strength 1000 uses 100% of that channel's calibrated power ceiling; strength 500 uses 50%. Different channels can overlap in software and same-channel NOTE retriggers its timer. The pin-42 conflict remains an electrical limitation.

## Protocol and stops

Newline-delimited ASCII, **115200 baud**, protocol v1:

```text
HELLO,1                 -> READY,1,ACTIVE
HELLO,2                 -> ERROR,PROTOCOL_VERSION
ARM                     -> ACK,ARM
NOTE,0,300,1000          -> ACK,NOTE,0
ALL_OFF                 -> ACK,ALL_OFF
STOP                    -> ACK,ALL_OFF
DISARM                  -> ACK,DISARM
ESTOP                   -> ACK,DISARM
STATUS                  -> STATUS,READY,PROTOCOL=1,MODE=FULL18,ARMED=FALSE
```

STATUS reports the actual armed state. Reset/upload starts disarmed and never starts motors. ARM first forces outputs LOW. ALL_OFF/STOP cancel pulses while staying armed; DISARM/ESTOP shut down and disarm. NOTE requires an integer channel 0–17, positive duration 1–5000 ms, strength 0–1000 and an armed endpoint. Manual `TEST,<channel>` uses calibration; `POWER,<channel>,<0-60>` and `PULSE,<channel>,<50-700>` update RAM calibration only. `CAL,<channel>`/`CALALL` report calibration; `SWEEP` is a manual sequential test, not a stored song.

## Upload and browser test

1. Keep actuator power off while verifying wiring and uploading the canonical sketch. Select Arduino Mega or Mega 2560 in Arduino IDE.
2. Serial Monitor: 115200 baud, Newline. Send STATUS and HELLO,1; check disarmed status and READY. Close Serial Monitor before the website opens the port.
3. From the repository root run:

```sh
cd frontend
npm install
npm run dev
```

4. Open `http://localhost:3000/control` in desktop Chrome or Edge on the Mac. Localhost is a secure context; Safari is unsupported. Use the port printed by Next.js if 3000 is occupied.
5. Select an existing song, click Generate, then Connect Arduino and choose the Mega USB port. Connection alone must not move motors. ACTIVE confirms protocol mode, not physical wiring or the installed sketch's channel count.
6. With actuator power off, click Play + Arduino. The browser owns timing and sends NOTE commands alongside the simulator/audio. Verify Pause, Stop and completion send ALL_OFF; E-Stop sends ALL_OFF then DISARM; disconnect sends ALL_OFF then DISARM before closing.
7. Powered testing remains pending the pin-42 resolution and individual channel verification. After wiring is verified, begin with one conservative manual NOTE and an accessible physical power cutoff before attempting songs.

## Software verification

From the repository root:

```sh
cd frontend
npm test
npm run build
cd ..
c++ -std=c++17 -Wall -Wextra -Werror -I hardware/arduino/mega_full_18_note/tests hardware/arduino/mega_full_18_note_web_serial/tests/protocol_test.cpp -o /tmp/angklobot-usb-protocol-test
/tmp/angklobot-usb-protocol-test
```

The C++ test uses the existing fake Arduino header: it validates command handling, duty scaling, pulse expiry, overlap and shutdown on the host. It is not an AVR compilation or physical verification. The current standalone lint script prompts for missing ESLint configuration.

## Historical documentation

The following describes earlier firmware, **not** the canonical USB sketch above.

# Historical full-rack setup (superseded above)

The Control website sends validated `actuator_schedule.v1` commands directly to an Arduino Mega 2560 over USB. The browser owns musical timing. The full-rack firmware owns output safety, pulse expiry, and non-blocking software PWM for all 18 motors.

## Previous full-rack firmware

Upload `mega_full_18_note/mega_full_18_note.ino` for the physical 18-angklung rack. The older `mega_low_5724_trial/` sketch remains as a historical four-note fallback and is not the current rack firmware.

| Channel | Note | Angklung number | IN1 / software PWM | IN2 / LOW |
| ---: | --- | ---: | ---: | ---: |
| 0 | G3 | 5 | 6 | 7 |
| 1 | A3 | 6 | 8 | 9 |
| 2 | B3 | 7 | 2 | 3 |
| 3 | C4 | 1 | 4 | 5 |
| 4 | D4 | 2 | 28 | 29 |
| 5 | E4 | 3 | 26 | 27 |
| 6 | F4 | 4 | 32 | 33 |
| 7 | G4 | 5 | 30 | 31 |
| 8 | A4 | 6 | 12 | 13 |
| 9 | B4 | 7 | 10 | 11 |
| 10 | C5 | 1 | 24 | 25 |
| 11 | D5 | 2 | 22 | 23 |
| 12 | E5 | 3 | 36 | 37 |
| 13 | F5 | 4 | 38 | 39 |
| 14 | G5 | 5 | 42 | 43 |
| 15 | A5 | 6 | 40 | 41 |
| 16 | B5 | 7 | 46 | 47 |
| 17 | C6 | 1 | 44 | 45 |

Repeated traditional numbers are labels, not hardware addresses. Website and firmware control always use the unique actuator channel `0` through `17`. The complete pin pairs above come directly from the latest physical sweep; IN1 and IN2 are not reversed within any motor pair. Channel 13 remains on pins 38,39 even though that physical angklung 4 did not produce a clear hit and must be diagnosed separately with `ARM` followed by `TEST,13`.

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
- `SWEEP`: while armed, non-blockingly plays channels 0-17 in logical G3-C6 order. Each channel uses its own calibrated power ceiling and pulse duration through the same safety-capped software-PWM path as `TEST`; it never requests uncalibrated 100% motor power. It responds `ACK,SWEEP` when started and `ACK,SWEEP,DONE` after channel 17 ends.
- `POWER,<channel>,<percent>`: changes one RAM-only power ceiling without activating a motor. Accepted range: 0-60%.
- `PULSE,<channel>,<milliseconds>`: changes one RAM-only TEST duration without activating a motor. Accepted range: 50-180 ms; the earlier 180 ms safety cap is intentionally stricter than the proposed 250 ms calibration ceiling.
- `CAL,<channel>`: prints that channel's note, angklung number, live power, live pulse, IN1, and IN2 values.
- `CALALL`: first stops all active pulses, then prints all 18 calibration records in channel order for copying back into source. It retains the armed state.
- `ALL_OFF` (or compatibility alias `STOP`): immediately cancels an active sweep and forces both pins LOW on every channel while retaining the armed state.
- `DISARM` (or compatibility alias `ESTOP`): immediately cancels an active sweep, forces all pins LOW, and rejects further NOTE/TEST/SWEEP commands until ARM.
- `STATUS`: reports readiness, armed state, protocol 1, and `FULL18` mode.

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

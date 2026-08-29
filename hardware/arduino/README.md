# Arduino Web Serial Trial

The Control website can send validated `actuator_schedule.v1` commands directly to an Arduino Mega over USB. The browser owns musical timing; the firmware receives non-blocking output pulses and handles `ALL_OFF` from Pause, Stop, completion, or disconnect. E-Stop also sends `DISARM`.

## Canonical firmware

Use `mega_low_5724_trial/mega_low_5724_trial.ino`. The current numbered angklungs are interpreted against the project's G3-C6 rack:

| Number | Pitch | Logical channel | PWM/drive pin | LOW/return pin |
| ---: | --- | ---: | ---: | ---: |
| 5 | G3 | 0 | 6 | 7 |
| 7 | B3 | 2 | 8 | 9 |
| 2 | D4 | 4 | 10 | 11 |
| 4 | F4 | 6 | 12 | 13 |

The pitch names are an explicit inference from the lowest portion of the diatonic rack: G3(5), A3(6), B3(7), C4(1), D4(2), E4(3), F4(4). Confirm that convention against the physical labels before enabling actuator power.

The firmware drives the first pin in each pair with PWM and holds the second pin LOW. Confirm that truth table against the external driver. Pins 6, 8, 10, and 12 support PWM on an Arduino Mega 2560.

## Bring-up sequence

1. Verify the board is an Arduino Mega or Mega 2560 and re-check all four pin pairs.
2. Keep actuator power off and upload `mega_low_5724_trial/mega_low_5724_trial.ino`.
3. Close Arduino Serial Monitor so it releases the USB port.
4. Open `/control` in desktop Chrome or Edge over localhost or HTTPS.
5. Select **Connect Arduino** and choose the Mega serial port.
6. Load **Trial: Low 5-7-2-4 Cycle** and run it once with actuator power off.
7. Verify the external drivers, common ground, protection, fusing, and physical power cutoff.
8. Enable actuator power under supervision and test 5, then 7, then 2, then 4.
9. Run the ping-pong and cross-pattern arrangements only after the slow cycle passes.

All three website arrangements activate only one channel at a time. No chord or simultaneous-output trial is included yet.

Web Serial requires a secure browser context. `http://localhost` qualifies; a network IP normally requires HTTPS. Safari and the Codex in-app browser should not be used for the physical USB connection.

## Protocol v1

All messages are newline-delimited ASCII at 115200 baud:

```text
Browser -> HELLO,1
Mega    -> READY,1,ACTIVE
Browser -> ARM
Browser -> ALL_OFF
Browser -> NOTE,0,500,800
Mega    -> ACK,NOTE,0
```

The firmware accepts only channels 0, 2, 4, and 6. Physical activation is capped at 180 ms, and website strength 0-1000 maps to PWM 0-100.

Firmware arming is only a software interlock. Do not connect motors or solenoids directly to GPIO. Use appropriately rated drivers, external actuator power, common signal ground, flyback protection for inductive loads, fusing, and a physical actuator-power emergency stop.

# Arduino Web Serial Trial

The control website can send its already validated `actuator_schedule.v1` commands directly to an Arduino over USB. The browser remains the schedule owner; the firmware receives one non-blocking output pulse per scheduled note and immediately handles `ALL_OFF` from Pause, Stop, completion, or disconnect. E-Stop sends `ALL_OFF` followed by `DISARM`.

## Safety boundary

The integrated firmware is `do_mi_sol_fallback/do_mi_sol_fallback.ino`. It drives the first pin of each pair with PWM and holds the second LOW. Firmware arming is a software interlock, not proof that the driver, actuator power, or physical emergency stop is safe.

Do not connect a motor or solenoid directly to an Arduino GPIO pin. Use an appropriately rated external driver, separate actuator power as required, common signal ground, flyback protection for inductive loads, a fuse, and a physical actuator-power emergency stop.

## Trial mapping

The sketch proposes only the three current C5/E5/G5 trial signals:

| Note | Solfege | Logical channel | Driver pin A | Driver pin B |
| --- | --- | ---: | ---: | ---: |
| C5 | Do | 10 | 11 | 12 |
| E5 | Mi | 12 | 9 | 10 |
| G5 | Sol | 14 | 3 | 5 |

Change `do1`/`do2`, `mi1`/`mi2`, and `sol1`/`sol2` in `do_mi_sol_fallback/do_mi_sol_fallback.ino` if the verified wiring differs. Other logical channels deliberately return `ERROR,UNMAPPED_CHANNEL`.

Pins 11, 9, and 3 are the PWM drive outputs for Do, Mi, and Sol respectively; pins 12, 10, and 5 are held LOW during forward drive. Confirm that truth table against the external driver and confirm PWM availability on the selected board.

## Bring-up sequence

1. Re-check the PWM/LOW driver truth table, `MOTOR_POWER`, and the three pin pairs against the physical build.
2. Upload `do_mi_sol_fallback/do_mi_sol_fallback.ino` with the Arduino IDE.
3. Close the Arduino IDE Serial Monitor so it does not own the USB port.
4. Start the website on `localhost`, open `/control` in Chrome or Edge, and select **Connect Arduino**.
5. Choose the board. The website must report that the Arduino is connected and disarmed until Play.
6. Keep actuator power off and generate `Trial: Do / C5` to confirm the browser connection remains stable.
7. Verify the board, external driver, pair behavior, actuator power, and physical emergency stop.
8. Energize actuator power under supervision. Run the C5 single-actuator trial before Mi, Sol, or any multi-actuator trial.

Web Serial requires a secure browser context. `http://localhost` qualifies; a network IP address normally requires HTTPS. Safari does not expose the Web Serial API, so use a Chromium-based browser for the operator control tab.

## Protocol v1

All messages are ASCII at 115200 baud and end with a newline.

```text
Browser -> HELLO,1
Arduino -> READY,1,ACTIVE
Browser -> ARM
Browser -> ALL_OFF
Browser -> NOTE,10,500,800
Arduino -> ACK,NOTE,10
Browser -> ALL_OFF
Arduino -> ACK,ALL_OFF
```

`NOTE` fields are logical channel (0-17), musical note duration (1-5000 ms), and normalized strength (0-1000). The firmware accepts only trial channels 10, 12, and 14, caps physical activation at the existing 180 ms fallback pulse, and maps strength to the current conservative PWM range 0-100.

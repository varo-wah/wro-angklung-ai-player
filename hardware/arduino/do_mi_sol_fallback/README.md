# Do-Mi-Sol Arduino Fallback

This sketch is a serial-controlled backup for the website trial. It uses the supplied octave-5 mapping:

| Note | Solfege | Arduino pins |
| --- | --- | --- |
| C5 | Do | 11 and 12 |
| E5 | Mi | 9 and 10 |
| G5 | Sol | 3 and 5 |

The `RUN` routine plays Do at 1 second, Mi at 2 seconds, Sol at 3 seconds, and the full C5+E5+G5 chord at 5 seconds.

## Required hardware decisions

Pins alone are not enough to determine safe output logic. Before enabling actuation:

1. Confirm the exact Arduino-compatible board.
2. Confirm that the first pin in each pair is a PWM-capable driver input and the second pin can remain LOW while the actuator runs.
3. Connect Arduino pins only to properly rated driver inputs. Never power motors or solenoids directly from GPIO pins.
4. Use an external actuator supply, common signal ground, flyback protection for inductive loads, suitable fusing, and a physical emergency-stop/power cutoff.
5. Verify that the supply and drivers can handle Do, Mi, and Sol activating simultaneously before using `CHORD` or `RUN`.

## Configuration

The current sketch drives the first pin of each pair with PWM and holds the second pin LOW:

```cpp
const int MOTOR_POWER = 100;        // manual tests, capped PWM output
analogWrite(do1, power);
digitalWrite(do2, LOW);
```

Website strength 0-1000 maps to the current conservative PWM range 0-100. Both outputs are set LOW at startup, and output commands are rejected until `ARM`. Confirm that pins 3, 9, and 11 provide PWM on the selected Arduino-compatible board.

## Serial operation

Open Arduino Serial Monitor at **115200 baud** with newline enabled. Commands are case-insensitive:

- `STATUS` — show configuration and state.
- `ARM` — permit output commands.
- `DO` — pulse C5 on pins 11 and 12.
- `MI` — pulse E5 on pins 9 and 10.
- `SOL` — pulse G5 on pins 3 and 5.
- `CHORD` — pulse all three pin pairs simultaneously.
- `RUN` — play Do, Mi, Sol, then the chord.
- `STOP` — immediately set every output LOW and cancel the routine while remaining armed.
- `ESTOP` or `DISARM` — set every output LOW and reject further output until re-armed.
- `DISARM` — stop and reject further output commands until re-armed.

Recommended physical test order: `ARM`, `DO`, `STOP`, `MI`, `STOP`, `SOL`, `STOP`, and only then `CHORD` or `RUN`.

## Website operation

The same sketch implements Angklobot Web Serial protocol v1. Close Serial Monitor, start the website on `localhost`, open `/control` in Chrome or Edge, and select **Connect Arduino**. The website verifies the `HELLO,1` / `READY,1,ACTIVE` handshake. When Play is clicked, it sends `ARM`, resets all outputs, and then sends the validated C5/E5/G5 schedule as timed `NOTE` commands. Pause, Stop, completion, and disconnect send `ALL_OFF`; E-Stop also sends `DISARM`.

The website can overlap independent `NOTE` commands, so the C5+E5+G5 chord activates all three pin pairs together. The manual Serial Monitor commands remain available as a fallback, but Serial Monitor and the browser cannot own the same USB port simultaneously.

Protocol messages use 115200 baud and newline-delimited ASCII:

```text
Browser -> HELLO,1
Arduino -> READY,1,ACTIVE
Browser -> ARM
Browser -> ALL_OFF
Browser -> NOTE,10,700,800
Arduino -> ACK,NOTE,10
```

The `NOTE` fields are logical actuator channel, musical note duration in milliseconds, and strength from 0 to 1000. To preserve the existing fallback safety behavior, physical output is capped at 180 ms even when the musical duration is longer. Strength is mapped to the configured PWM range 0-100.

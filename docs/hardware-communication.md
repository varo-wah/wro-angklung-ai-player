# Angklobot Hardware Communication

## Planned Architecture

The planned physical communication path is:

```text
Laptop / Angklobot Website
        |
      Wi-Fi
        |
      ESP32
        |
   UART serial
        |
Arduino Mega 2560
        |
  Motor drivers
        |
18 Angklung motors
```

The ESP32 will eventually act as the network bridge. The Arduino Mega 2560
will remain responsible for deterministic, safety-critical actuator control.

Phase 1 established reliable bidirectional UART PING/PONG communication. Phase
2A adds NOTE command parsing and validation without activating any motor. It
does not implement Wi-Fi, WebSockets, motor control, song scheduling, actuator
schedule uploading, or website integration.

## Phase 1 UART Wiring

| From | To | Requirement |
| --- | --- | --- |
| ESP32 UART2 TX / GPIO17 | Arduino Mega RX1 / pin 19 | ESP32 transmits at 3.3 V logic. |
| Arduino Mega TX1 / pin 18 | ESP32 UART2 RX / GPIO16 | Use a logic-level converter or a suitable voltage divider. |
| ESP32 GND | Arduino Mega GND | The boards need a common signal ground. |

The Arduino Mega uses 5 V logic, while the ESP32 uses 3.3 V logic. The Mega TX
signal must not be connected directly to the ESP32 RX pin without level
shifting. Verify the selected ESP32 board's UART pin assignment and the level
shifter or divider design before applying power.

The Phase 1 firmware uses UART2 with GPIO16 as ESP32 RX and GPIO17 as ESP32 TX.
These are configurable constants near the top of `angklobot_bridge.ino`, not a
claim that every ESP32 variant exposes the same pins. Confirm the exact board's
pinout before testing. Both UART endpoints use 115200 baud with 8 data bits, no
parity, and 1 stop bit (8-N-1).

During initial testing, power both boards independently over their own USB
connections. Do not power motors from either microcontroller board; the motor
drivers and actuator power system will be designed and validated separately.

## UART Link Test

Messages are newline-terminated ASCII. Every two seconds, the ESP32 sends
`PING`. The Mega reads it through `Serial1`, replies with `PONG`, and both boards
report the exchange through their independent USB Serial Monitor connections.
Empty lines are ignored, and neither firmware uses a blocking delay.

## Phase 2A NOTE Parser

Phase 2A accepts this newline-terminated ASCII command:

```text
NOTE,<note>,<power>,<duration>
```

| Field | Phase 2A validation |
| --- | --- |
| `note` | Provisional one-based motor/note ID from 1 through 18. |
| `power` | Integer percentage from 0 through 100. |
| `duration` | Integer duration from 1 through 2000 milliseconds. |

The numeric note-ID convention is provisional because the physical rack is an
18-note G3-C6 rack but the repository does not yet define a final numeric UART
mapping. The 2000 ms duration ceiling is an input-validation limit, not an
approved motor activation duration. Both must be reconciled with the final
motor map and physical safety limits before actuation is implemented.

A valid command such as `NOTE,5,30,300` receives:

```text
OK,NOTE,5,30,300
```

Invalid input receives one of:

```text
ERROR,INVALID_NOTE
ERROR,INVALID_POWER
ERROR,INVALID_DURATION
ERROR,MALFORMED_COMMAND
```

All four fields must be present, base-10 integers, fit within the parser's
signed integer type, and contain no extra fields or trailing characters. Input
lines are limited to 63 characters. Negative values parse as integers and then
receive the field-specific range error. Phase 2A acknowledges valid commands
but does not configure motor pins, change PWM, or activate an output.

## Planned Command Protocol

The broader planned command set remains:

```text
PING
PONG
NOTE,<note>,<power>,<duration>
STOP
STATUS
CLEAR
START
```

`PING`, `PONG`, and NOTE parsing are implemented. No `STOP`, `STATUS`, `CLEAR`,
or `START` behavior is implemented yet. Their acknowledgements, error
responses, timeouts, duplicate handling, and safety behavior remain undefined.

## Upload and Test Procedure

1. Disconnect power before wiring the UART link.
2. Connect ESP32 GPIO17 (TX) to Mega pin 19 (RX1).
3. Connect Mega pin 18 (TX1) to ESP32 GPIO16 (RX) through a suitable voltage
   divider or logic-level converter. Never connect the 5 V Mega TX signal
   directly to the 3.3 V ESP32 RX input.
4. Connect ESP32 GND to Mega GND.
5. Keep all motors and motor drivers disconnected for this test.
6. Connect each board independently to the laptop with its own USB cable.
7. Upload `firmware/arduino-mega/angklobot_mega/angklobot_mega.ino` with the
   board set to Arduino Mega or Mega 2560 and the correct Mega USB port selected.
8. Upload `firmware/esp32/angklobot_bridge/angklobot_bridge.ino` with the exact
   ESP32-S3 board and its USB port selected. Confirm GPIO16 and GPIO17 are
   suitable first.
9. Open a Serial Monitor for each board at 115200 baud. If the IDE cannot keep
   two monitors open, use separate serial-monitor applications or two IDE
   instances, each attached to the correct USB port.
10. Reset the Mega, then reset the ESP32. Confirm that the ESP32 sends
    `NOTE,5,30,300` once and receives `OK,NOTE,5,30,300`, without any motor
    movement.
11. Confirm that the ESP32 then sends `PING` every two seconds and receives
    `PONG`. Confirm that the Mega reports each received `PING` and sent `PONG`.

## Existing Firmware and Motor-Control Code

The repository already contains a working-scope Arduino Mega trial at
`hardware/arduino/mega_low_5724_trial/mega_low_5724_trial.ino`, with supporting
notes in `hardware/arduino/mega_low_5724_trial/README.md` and
`hardware/arduino/README.md`.

That trial currently controls four mapped Angklungs rather than the future
18-motor system. It uses PWM/drive pins 6, 8, 10, and 12; holds return pins 7,
9, 11, and 13 LOW; and maps logical channels 0, 2, 4, and 6. It communicates
directly with the website over the Mega USB `Serial` connection. Phase 2A does
not delete, replace, import, or modify that firmware or its mappings.

Related software boundaries are documented in `docs/hardware.md`,
`hardware/wiring.md`, and `docs/architecture.md`. The current browser-side
serial implementation is in `frontend/src/lib/arduinoSerial.ts`, while the
Python actuator placeholder is in `src/actuator_controller.py`.

## Architecture Notes for the Next Phase

The existing USB Web Serial trial and the planned ESP32 UART architecture use
different transports and partially different command vocabularies. In
particular, the existing trial's `NOTE` fields and lifecycle commands must not
be assumed to match the Phase 2A protocol. A later protocol phase should define
the final note mapping, acknowledgements, timeouts, duplicate handling, and safe
startup/disconnect behavior before adding motor actuation.

The complete 18-motor pin map and software PWM implementation must be sourced
from the existing authoritative motor-control design when it is available; it
must not be inferred from the four-motor trial. Physical labels, driver input
logic, current requirements, flyback protection, fusing, emergency cutoff,
grounding, and actuator power must also be verified before motor power is
enabled.

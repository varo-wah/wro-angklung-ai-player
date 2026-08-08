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
2. Confirm that each pair is either two independent active-HIGH driver inputs or an H-bridge `IN1/IN2` pair.
3. Connect Arduino pins only to properly rated driver inputs. Never power motors or solenoids directly from GPIO pins.
4. Use an external actuator supply, common signal ground, flyback protection for inductive loads, suitable fusing, and a physical emergency-stop/power cutoff.
5. Verify that the supply and drivers can handle Do, Mi, and Sol activating simultaneously before using `CHORD` or `RUN`.

## Configuration

Open `do_mi_sol_fallback.ino` and select the correct pair behavior:

```cpp
constexpr PairDriveMode PAIR_DRIVE_MODE = PairDriveMode::DUAL_ACTIVE_HIGH;
```

Use `DUAL_ACTIVE_HIGH` only when both pins are independent active-HIGH driver inputs. Use `HBRIDGE_FORWARD` only when each pair is an H-bridge direction pair and `HIGH/LOW` is the verified actuation direction.

After the wiring and driver review is complete, change:

```cpp
constexpr bool HARDWARE_CONFIGURATION_CONFIRMED = false;
```

to `true`, then compile and upload the sketch.

## Serial operation

Open Arduino Serial Monitor at **115200 baud** with newline enabled. Commands are case-insensitive:

- `STATUS` — show configuration and state.
- `ARM` — permit output commands after configuration is confirmed.
- `DO` — pulse C5 on pins 11 and 12.
- `MI` — pulse E5 on pins 9 and 10.
- `SOL` — pulse G5 on pins 3 and 5.
- `CHORD` — pulse all three pin pairs simultaneously.
- `RUN` — play Do, Mi, Sol, then the chord.
- `STOP` or `ESTOP` — immediately set every output LOW and cancel the routine.
- `DISARM` — stop and reject further output commands until re-armed.

Recommended physical test order: `ARM`, `DO`, `STOP`, `MI`, `STOP`, `SOL`, `STOP`, and only then `CHORD` or `RUN`.

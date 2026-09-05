# Archived Arduino Mega Low 5-7-2-4 Trial

This is the preserved four-motor trial firmware, not the current full-rack firmware. For the 18-angklung robot, upload `../mega_full_18_note/mega_full_18_note.ino` and use the mapping in `../README.md`.

The historical numbered labels were interpreted from the project's G3-C6 diatonic rack as follows:

| Number | Pitch | Website channel | PWM/drive pin | LOW/return pin |
| ---: | --- | ---: | ---: | ---: |
| 5 | G3 | 0 | 6 | 7 |
| 7 | B3 | 2 | 8 | 9 |
| 2 | D4 | 4 | 10 | 11 |
| 4 | F4 | 6 | 12 | 13 |

Confirm the numbered-label-to-pitch assumption against the physical rack before enabling actuator power. The firmware drives the first pin in each pair with PWM and holds the second pin LOW, matching the previously supplied working pattern.

## Upload

1. Open `mega_low_5724_trial.ino` in Arduino IDE.
2. Select **Arduino Mega or Mega 2560** and the correct processor/port.
3. Keep actuator power off and upload the sketch.
4. Optionally open Serial Monitor at **115200 baud** with newline enabled.
5. Close Serial Monitor before connecting from the website.

## Manual fallback

Commands are case-insensitive:

- `STATUS` reports whether output is armed.
- `ARM` enables pulse commands.
- `5`, `7`, `2`, or `4` pulses one numbered angklung.
- `RUN` pulses 5, 7, 2, then 4 at one-second intervals.
- `STOP` immediately turns every output off while remaining armed.
- `ESTOP` or `DISARM` turns every output off and requires a new `ARM`.

Recommended physical order: actuator power off, `ARM`, `5`, `STOP`, `7`, `STOP`, `2`, `STOP`, `4`, `STOP`. Only then try `RUN` or a website arrangement.

## Historical website protocol

The firmware implements newline-delimited Angklobot Web Serial protocol v1 at 115200 baud:

```text
Browser -> HELLO,1
Mega    -> READY,1,ACTIVE
Browser -> ARM
Browser -> ALL_OFF
Browser -> NOTE,0,500,800
Mega    -> ACK,NOTE,0
```

This archived sketch accepts only logical channels 0, 2, 4, and 6. The current website supports channels 0-17 and must be paired with the full-rack firmware instead. In this fallback sketch, musical duration is accepted in milliseconds but physical output remains capped at 180 ms, and strength 0-1000 maps to PWM 0-100.

Use rated external motor/solenoid drivers, appropriate actuator power, common signal ground, flyback protection for inductive loads, suitable fusing, and a physical power cutoff. Arduino GPIO must not directly power an actuator.

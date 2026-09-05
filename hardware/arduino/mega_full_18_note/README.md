# Arduino Mega Full 18-Note Rack

`mega_full_18_note.ino` is the firmware to upload for the G3-C6 physical rack. It implements protocol v1 at 115200 baud, channels 0-17, strict command validation, a 180 ms pulse cap, RAM-only live power/pulse calibration, and non-blocking software PWM on every IN1 pin.

The complete channel/pitch/pin table, protocol, power-off verification, and one-channel-at-a-time procedure are maintained in the parent [`README.md`](../README.md).

The sketch starts disarmed and sets all 36 driver inputs LOW before starting serial. `HELLO`, `ARM`, `POWER`, `PULSE`, `CAL`, and `CALALL` never cause movement; only a valid `NOTE` or `TEST` received after `ARM` may activate a channel. `TEST` uses that channel's current `motorPowerPercent` and `motorPulseMs` values without recompiling.

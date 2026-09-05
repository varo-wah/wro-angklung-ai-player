# Arduino Mega Full 18-Note Rack

`mega_full_18_note.ino` is the firmware to upload for the physical 18-channel rack. It implements protocol v1 at 115200 baud, channels 0-17, strict command validation, a 180 ms pulse cap, RAM-only live power/pulse calibration, and non-blocking software PWM on every IN1 pin.

The firmware records the corrected physical angklung-number sequence `6,5,1,7,3,2,5,4,7,6,2,1,4,3,6,5,1,7`. It intentionally does not claim that the former G3-C6 pitch order matches the physical rack.

The complete channel/physical-number/pin table, protocol, power-off verification, and one-channel-at-a-time procedure are maintained in the parent [`README.md`](../README.md).

The sketch starts disarmed and sets all 36 driver inputs LOW before starting serial. `HELLO`, `ARM`, `POWER`, `PULSE`, `CAL`, and `CALALL` never cause movement; only a valid `NOTE` or `TEST` received after `ARM` may activate a channel. `TEST` uses that channel's current `motorPowerPercent` and `motorPulseMs` values without recompiling.

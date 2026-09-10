# Arduino Mega Full 18-Note Rack

`mega_full_18_note.ino` is the firmware to upload for the G3-C6 physical 18-channel rack. It implements protocol v1 at 115200 baud, channels 0-17, strict command validation, a 180 ms pulse cap, RAM-only live power/pulse calibration, and non-blocking software PWM on every IN1 pin.

The logical channel order remains G3-C6 with angklung-number sequence `5,6,7,1,2,3,4,5,6,7,1,2,3,4,5,6,7,1`. The complete pin-pair assignments come from the latest physical sweep, and pin direction within every pair is unchanged. Channel 13 remains on pins 38,39 pending separate diagnosis of its missing hit.

The complete channel/note/angklung/pin table, protocol, power-off verification, and one-channel-at-a-time procedure are maintained in the parent [`README.md`](../README.md).

The sketch starts disarmed and sets all 36 driver inputs LOW before starting serial. `HELLO`, `ARM`, `POWER`, `PULSE`, `CAL`, and `CALALL` never cause movement; only a valid `NOTE`, `TEST`, or `SWEEP` received after `ARM` may activate a channel. `TEST` and the non-blocking G3-C6 `SWEEP` use each channel's current `motorPowerPercent` and `motorPulseMs` values without recompiling or bypassing the firmware pulse cap.

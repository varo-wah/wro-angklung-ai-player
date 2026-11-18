# Per-note fortissimo calibration

On the Mac USB controller, open Manual notes and turn on Calibration mode.
Set raw motor power, hold the desired note to test it, then release. Press
**Set tested power as song ff max** to save the last acknowledged test value.
Changing the percentage requires another test before saving. Save disarms the
rack and never starts a note. Restore returns that note to its original mapping.

Custom ceilings use `raw duty = saved percent × musical strength × player volume`
(with integer PWM rounding). The old 1.5× firmware boost is bypassed for these
notes. Thus 40% saved means a maximum of 40% raw duty at strength 1 and volume
100%; softer passages remain softer. Manual testing remains independent.
Uncalibrated channels keep the old mapping. Calibrated test/sweep pulses using
the same firmware mapping also respect the ceiling.

Values are stored per channel in Arduino EEPROM, so browser reloads and board
restarts retain them. Value/complement records reject erased or interrupted
writes and fall back to the original calibration. Factory restore uses sentinel
255. This is a motor-duty limit, not measured RPM or acoustic loudness.

Firmware commands: USB-only `FFMAX_GET` returns `FFMAX,<18 values>`;
`FFMAX,<channel>,<0..100 or 255>` saves only while disarmed, returning
`ACK,FFMAX,<channel>,<value>`. Saving requires the updated Mega firmware;
older firmware leaves the save controls disabled with an update message.
Actual preferred percentages must be chosen by the operator on the powered rack.

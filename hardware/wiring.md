# Wiring

## Status

No final wiring design exists yet.

Do not write GPIO, Arduino, Raspberry Pi, ESP32, or motor-driver code until the exact controller board, actuator type, driver modules, voltage, and current requirements are chosen.

## Required Decisions

Before wiring is documented, decide:

- Controller board.
- Actuator type for each angklung.
- Driver circuit or driver module.
- External power supply rating.
- Grounding strategy between controller and actuator power.
- Emergency stop method.
- Note-to-actuator mapping.

## Initial Wiring Principles

- Keep actuator power separate from logic power unless the selected hardware explicitly supports shared supply.
- Use a common ground when control signals cross between logic and driver circuits.
- Do not drive motors or solenoids directly from microcontroller pins.
- Add flyback protection for inductive loads such as solenoids and relays.
- Include a physical power cutoff for actuator power.

## Placeholder Mapping

```text
C4 -> actuator TBD
D4 -> actuator TBD
E4 -> actuator TBD
F4 -> actuator TBD
G4 -> actuator TBD
A4 -> actuator TBD
B4 -> actuator TBD
C5 -> actuator TBD
```

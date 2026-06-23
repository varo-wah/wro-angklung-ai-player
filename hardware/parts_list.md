# Parts List

## Status

The hardware bill of materials is not finalized.

The project should not lock into a specific actuator system until the mechanical shaking method is tested.

## Candidate Parts

### Control

- Raspberry Pi, laptop, or single-board computer for high-level scheduling.
- Arduino, ESP32, RP2040, or similar microcontroller for low-level actuator timing.

### Actuation

- Servo motor for simple controlled shaking.
- Solenoid for fast strike or shake impulse.
- DC motor with cam for repeated mechanical motion.
- Stepper motor for precise movement, if the mechanism justifies the complexity.

### Driver And Power

- Servo power supply sized for stall current.
- MOSFET driver board for solenoids or DC motors.
- Flyback diodes or protected driver modules for inductive loads.
- Fuse or resettable protection device.
- Emergency stop switch.

## Recommendation For First Prototype

Start with one note and one actuator. Prove repeatable motion and timing before scaling to multiple angklung instruments.

Scaling too early will multiply mechanical, electrical, and software variables at the same time.

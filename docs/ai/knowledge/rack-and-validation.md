# Rack and validation

The current physical rack contains 18 natural notes: G3, A3, B3, C4, D4, E4, F4, G4, A4, B4, C5, D5, E5, F5, G5, A5, B5, and C6. It has no sharps or flats.

Songs must be transposed, simplified, or rearranged into this exact note set. Unsupported pitches are rejected rather than silently sent to an actuator. Validation also checks timing, simultaneous actuator use, command duration, and other motor-safety constraints.

Not every requested song can be played immediately. It first needs a suitable MIDI or MusicXML source, conversion into the rack range, simplification where necessary, an arrangement JSON file, catalog registration, and validation. Simulator success does not automatically prove that an arrangement is safe for physical motors.

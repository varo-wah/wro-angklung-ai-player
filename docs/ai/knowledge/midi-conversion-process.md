# MIDI conversion process

MIDI is generally easier to convert than a PDF score because MIDI contains explicit note, track, velocity, and timing events. A PDF mainly describes page appearance and usually requires music-recognition work before reliable note events exist.

The conversion flow is: MIDI → detect tracks → choose melody and accompaniment → transpose or simplify into the G3-C6 natural-note set → validate → create arrangement JSON → add a catalog entry.

The melody usually targets G4-C6, while accompaniment normally uses G3-F4. Dense piano MIDI may sound acceptable in the simulator but still require fewer overlaps, longer gaps, or simpler accompaniment before real motors can perform it safely.

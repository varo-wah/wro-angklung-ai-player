# WRO demo explanation

Judge-friendly summary: Angklobot is a local AI-powered robotic angklung system that lets a visitor converse with the machine, choose from validated music, and watch a safe digital arrangement become synchronized angklung actuation.

The AI contribution is local Ollama conversation, intent interpretation, catalog-grounded matching, and recommendations. The robotics contribution is converting validated musical timing into an actuator schedule for a motorized 18-note angklung rack. Validation matters because a plausible AI response is not sufficient evidence that pitches, overlaps, or timings are physically safe.

Local Ollama allows the demo to run on a WRO laptop without depending on cloud connectivity and keeps response data on the machine. Planned extensions include microphone and speaker interaction, camera-based presence detection, a wake word, MIDI upload conversion, and the physical hardware driver. These are future capabilities, not current claims.

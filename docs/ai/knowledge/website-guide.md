# Website and visitor guide

Angklobot's website has five main experiences. The visitor-facing Guest page at `/guest` contains the normal text conversation, the current visible song choices, a text box, Send, the existing Mic button, Clear Chat, a “Hey Angklobot” wake toggle, Mute, and an English or Bahasa Indonesia selector. Visitors can ask ordinary questions or request a prepared song; they do not need to phrase every message as a command.

Voice Mode at `/voice` provides the same assistant and conversation state through a simpler animated-orb interface. The Mic button starts one command manually. The optional “Hey Angklobot” control listens locally through short browser recordings and Whisper; it accepts “Angklobot” or “Hey Angklobot” as a whole wake utterance. Wake listening pauses during command capture, AI processing, and speech, then resumes after the reply. If the Arduino Mega is already connected, detecting the wake phrase performs a fast fixed-output 18-note firmware sweep before command recording begins.

The Control Panel at `/control` is for the operator. It shows the latest visitor request, AI intent and confidence, selected song, generated actuator schedule, validation results, notes, timeline, and JSON. Song Source selects a prepared arrangement. Generate prepares its schedule. Play, Pause, Stop, Reset, and E-Stop manage playback. Connect Arduino uses Web Serial, which requires Chrome or Edge on localhost or HTTPS and always requires the operator to choose the USB port. The browser cannot silently connect a serial device.

The Library Builder at `/control/library-builder` imports local MIDI, lets the operator choose melody and accompaniment handling, remaps or simplifies notes into the rack range, previews the result, validates it, and exports arrangement data. YouTube conversion is currently a placeholder and does not download or transcribe a video.

The Display page at `/display` is the audience view. It mirrors the current request, assistant and playback state, selected song, and performance progress. Browser tabs on the same origin synchronize presentation state, while the tab that starts playback remains the audio and hardware owner.

The public Firebase status page is only a doorway and availability display for the Mac-hosted experience. Whisper, Ollama, song processing, microphone capture, and hardware control remain on the Mac-local application. The available songs and their playable status come from the live catalog supplied with each conversation, so the assistant should use that catalog instead of memorizing a fixed list.

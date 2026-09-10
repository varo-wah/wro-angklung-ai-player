# Local Whisper “Hey Angklobot” prototype

The optional Guest toggle uses the existing browser microphone recorder and local Whisper.cpp endpoint. No wake-word model, access key, training, or additional service is required. The openWakeWord training path is paused; its scripts and research remain available for later, but are not used by the Guest page.

## Start on this Mac

Keep these three processes running, each in a terminal from the repository root:

```bash
ollama serve
```

```bash
scripts/start_voice_macos.sh
```

```bash
cd frontend
npm run dev -- --hostname 127.0.0.1 --port 3000
```

Ollama needs the existing `llama3.2:latest` model. Skip starting a process if it already owns its port (Ollama 11434, Whisper 8080, Next.js 3000). Do not run `start_wakeword_macos.sh` or training scripts for this prototype.

## Test

1. Select **MacBook Pro Microphone** under macOS System Settings → Sound → Input if Continuity Microphone selects your phone.
2. Open http://localhost:3000/guest. Set **Voice on** and select English or Bahasa Indonesia for commands.
3. Click **Hey Angklobot: Off** once and allow microphone access. Wait for **Listening for “Hey Angklobot”**.
4. Say **“Hey Angklobot”** by itself, then pause. Do not press Mic.
5. Wait until **Listening to command**, then say **“What songs can you play?”**.
6. Stop speaking. The existing flow transcribes, asks Angklobot, and speaks its answer. After the reply ends, wake listening resumes.
7. Say the wake phrase again for another command. Disable the toggle to stop, or use the existing Mic button at any time it is available.

“Wake listener last heard” shows the latest wake transcription only in page memory. If it is wrong, repeat the phrase clearly. No acoustic accuracy claim is implied by lifecycle tests. An initial test exposed previous-audio context leaking into later Whisper recordings. The route now sends `no_context=true`; a local synthetic wake sample then transcribed as “Hey Angklobot.”, followed by a correct unrelated recording. Your own pronunciation and room noise still need a manual check.

## Operation and limits

- Each browser recording lasts up to 4 seconds and finishes after 650 ms of silence following speech. Silent segments are discarded without an HTTP request.
- Speech-bearing segments use the existing `/api/speech/transcribe` route with `purpose=wake` and English wake recognition. This mode requires a loopback Whisper URL, even if another URL is configured for manual commands. Raw audio goes only to the local Next.js/Whisper stack, not an external recognition provider.
- Matching normalizes case, accents, punctuation and spaces. The entire utterance must be `hey` plus a name starting with `ang` and ending with `bot`, within two character edits of `angklobot`. Examples: “Hey Angklobot,” “Hey angklo bot,” and “Hey anglo bot.” Longer commands containing the phrase, “Hey Siri,” and “Hey Uncle about” do not trigger.
- Each Whisper request sends `no_context=true` so prior audio cannot seed repetitive transcripts in new segments or commands.
- One segment is transcribed at a time. There is a listening gap while Whisper processes it; phrases crossing a segment boundary may need repeating. This is a practical prototype, not a low-latency acoustic wake-word engine.
- Detection consumes the current listening session. The recorder has released its microphone before normal command capture starts. Pending recordings and HTTP requests are cancelled on suspension; stale results cannot activate a command.
- Wake listening is paused during command capture, transcription, AI processing and queued/active TTS. It rearms 500 ms after the interaction becomes idle, including muted replies. No wake beep is used.
- A whole wake utterance of “Angklobot” or “Hey Angklobot” invokes the connected `mega_full_18_note_web_serial` firmware greeting. The browser sends `ARM`, enters the firmware's required calibration-mode safety gate, and sends the fast fixed-output command `SWEEP,30,150,50`. It waits for `ACK,SWEEP,DONE`, then sends `CALDONE` and `DISARM` before opening command capture. This is a note sweep, not `CALSWEEP`, and it does not change stored motor calibration. If no Mega is connected, voice continues without the physical greeting. Web Serial still requires the operator to connect the Mega explicitly from the Control Panel.
- Disable, page exit/unmount, permission revocation, or fatal recorder/Whisper errors stop the loop. A saved preference never automatically opens the microphone on reload; click to enable again.
- Manual recording defaults remain 15 seconds / 1200 ms silence. English and Bahasa Indonesia command transcription and TTS remain on the existing path.
- Browser capture uses the system/default input. This change does not add a microphone device selector.

## Code and validation

- `frontend/src/lib/wakeWord.ts`: normalized phrase matcher and single-owner recording/transcription loop.
- `frontend/src/hooks/useWakeWord.ts`: optional toggle, permission lifecycle, preference, suspension and resume.
- `frontend/src/hooks/useVoiceAssistant.ts`: existing command/AI/TTS handoff.
- `frontend/src/lib/voice.ts`: shared recorder, optional short-segment timing, existing WAV normalization.
- `frontend/tests/`: phrase boundaries, silent segments, cancellation/stale results, microphone failures, local endpoint guard, manual Mic/Indonesian support, React Strict Mode, and TTS rearm tests.

Run `cd frontend && npm test && npm run build`. Real microphone recognition and speaker feedback must still be checked with the user's voice in the target room.

Deferred native research is in [wakeword-openwakeword-deferred.md](wakeword-openwakeword-deferred.md).

# Deferred openWakeWord research

**Paused:** this is historical setup/training research. The Guest toggle now uses browser recording plus local Whisper. No custom classifier or training is required for the current prototype. Do not start the native service alongside the prototype. See [current setup](wakeword-macos.md).

# Local Mac “Hey Angklobot” — phase 1

**Status:** The runtime and voice integration are implemented. No trained “Hey Angklobot” classifier is supplied. Enabling the toggle without one reports a missing model and does not open the native microphone. This is not yet a claim that the phrase can be recognized.

## Architecture and microphone ownership

`Mac microphone → Python openWakeWord / ONNX → loopback WebSocket event → existing browser recorder → /api/speech/transcribe → Whisper → existing AI route → browser TTS`

The Python process binds only to `127.0.0.1:8765`. It starts with the microphone closed. One Guest tab can own its WebSocket session. Enabling the UI checks model readiness and obtains/releases browser microphone permission before arming native capture. The service handles 16 kHz mono PCM in memory, locally; it does not stream audio over the WebSocket or upload recordings. No API key or account is needed.

On detection the service stops and closes its stream **before** sending the event. The browser consumes that event once, waits 250 ms for a phrase/command boundary, then uses the existing voice recorder. Say the wake phrase first, wait for **Listening to command**, then say the command. A command spoken immediately after the wake phrase without waiting may be clipped.

Manual Mic and typed chat also await a suspension acknowledgement before recording or TTS. Detection stays suspended during transcription, AI work, and queued/active TTS. TTS is marked busy before `speechSynthesis.speak`, because `onstart` may arrive late. After the final response finishes (or a muted response completes), the browser waits 500 ms before rearming. Stop speaking and silence/no-command recovery also rearm. Fatal errors disable the session; enable again after resolving them.

Session IDs, arm generations, and client revisions reject repeated/stale events and stale acknowledgements. Socket disconnect/unmount closes native capture, browser tracks, timers and speech. WebSocket heartbeat detects a vanished tab without rapid polling. A second wake-enabled tab is rejected. Use one Guest tab for this phase; do not record from other apps/tabs simultaneously.

The saved preference is a reminder, not permission to reopen the microphone. A reload always requires clicking the toggle again. Browser permission revocation disables wake mode where the Permissions API is available; native device failures and command-capture failures also shut it down. Native microphone permission belongs to the process launcher (e.g. Terminal), separately from the browser.

## Install once

From the repository root:

```bash
scripts/setup_wakeword_macos.sh
```

This creates an isolated `.voice/wakeword-venv` without changing the project's existing Python environment, installs openWakeWord 0.6.0, ONNX Runtime, sounddevice and aiohttp, then downloads and validates upstream's shared `melspectrogram.onnx` and `embedding_model.onnx`. The custom phrase classifier is a separate file. `.voice/` is ignored by Git.

Tested here with Python 3.13 on Apple Silicon. The sounddevice Mac wheel includes PortAudio. If your Python has no compatible dependency wheels, use a supported Python via `ANGKLOBOT_WAKEWORD_PYTHON=/path/to/python3 scripts/setup_wakeword_macos.sh`; do not install the Linux-only TFLite/Speex dependencies.

List microphones without recording:

```bash
scripts/start_wakeword_macos.sh --list-devices
```

Prefer the name rather than a device index, which can change. This Mac lists `MacBook Pro Microphone`. In macOS **System Settings → Sound → Input**, choose the same device for browser command capture; otherwise Continuity Camera may route the browser to an iPhone even though native wake detection uses the Mac.

## Start the local services

In separate terminals, from the repository root (reuse already-running services):

```bash
# Terminal 1
ollama serve
# In another shell, only if llama3.2 is missing:
# ollama pull llama3.2

# Terminal 2
scripts/start_voice_macos.sh

# Terminal 3
scripts/start_wakeword_macos.sh --device 'MacBook Pro Microphone'

# Terminal 4
cd frontend
npm run dev -- --hostname 127.0.0.1 --port 3000
```

The wake service remains available for diagnostics when the custom model is absent:

```bash
curl http://127.0.0.1:8765/health
```

`ready: false` and a model-missing error are expected until the model is installed. The Guest toggle connects to the process; it does not launch a Python process from the browser. “Starting wake-word service” means connecting/arming it.

Options:

- `ANGKLOBOT_WAKEWORD_MODEL`: absolute path to a reviewed custom `.onnx` classifier; default `.voice/wakeword-models/hey_angklobot.onnx`.
- `ANGKLOBOT_WAKEWORD_THRESHOLD`: score threshold, default `0.5`; detection requires two consecutive 80 ms frames. Tune with held-out recordings.
- `ANGKLOBOT_WAKEWORD_PORT`: default `8765`.
- `ANGKLOBOT_VOICE_DIR`: shared local runtime/model directory, default `.voice`.
- `frontend/.env.local`: optional `NEXT_PUBLIC_WAKEWORD_SERVICE_URL=ws://127.0.0.1:8765/ws` if changing the port. Restart Next.js after changing it. Only loopback URLs are accepted. Default frontend origins are localhost/127.0.0.1 port 3000.

The wake word is English regardless of command language. The existing **Voice language** control still selects English or Bahasa Indonesia for Whisper and TTS.

## Custom model: what remains

openWakeWord does not ship an Angklobot model. Renaming `hey_jarvis.onnx`, editing a label, or changing the UI text cannot teach the phrase. Do not do that.

There are two training paths, both without a commercial service dependency:

### Local CPU prototype on this Mac

The included trainer uses openWakeWord's fixed audio embeddings and trains a small scikit-learn MLP classifier. It exports the ONNX input/output shape expected by openWakeWord and checks the exported probabilities against the fitted classifier. This is an **experimental personal prototype**, not the upstream large-scale training recipe or a guaranteed robust competition model.

```bash
.voice/wakeword-venv/bin/python -m pip install -r scripts/requirements-wakeword-training.txt
.voice/wakeword-venv/bin/python scripts/train_wakeword_local.py --prepare
```

Supply consented, locally recorded or offline-synthesized WAVs in:

```text
.voice/wakeword-training/data/
  train/positive/*.wav
  train/negative/*.wav
  test/positive/*.wav
  test/negative/*.wav
```

Positive clips must contain exactly **Hey Angklobot** with the pronunciation you intend to use, ending near the end of the file (at most about 200 ms trailing silence). Use mono 16 kHz PCM16 WAV, 0.5–3 seconds long. Negatives should contain ordinary conversation, similar phrases, isolated “hey”/“Angklobot”, music, noise, and typical Angklobot replies. Do not include the full target phrase in negative clips. Include the actual room, microphone, distances, and Indonesian-accented English pronunciation. Split speakers/recording sessions between train and test **before** augmentation; never put variants of the same source clip in both. The script rejects byte-identical duplicates but cannot verify labels or speaker independence.

The guardrails require at least 20 positive/20 negative training clips and five of each for testing only to prevent an empty/tiny accidental run. Those counts do **not** establish acceptable accuracy. Collect substantially more diverse data (ideally hundreds/thousands of positives and much more negative audio), or use the upstream recipe below. There is no speech data in the repository and no model is generated from placeholder/noise fixtures.

```bash
.voice/wakeword-venv/bin/python scripts/train_wakeword_local.py --check
.voice/wakeword-venv/bin/python scripts/train_wakeword_local.py
```

Output: `.voice/wakeword-training/hey_angklobot.candidate.onnx` plus JSON held-out clip metrics and a model hash. Existing outputs are not overwritten. The script never installs the candidate. Counts are per-clip metrics, **not** false alarms per hour.

Before installing, test held-out users and several hours of non-target speech/music from the deployment environment. Measure misses and false activations, vary threshold, and compare repeat runs. Review any scikit-learn non-convergence warning rather than treating export success as model quality. For a temporary evaluation run, point `ANGKLOBOT_WAKEWORD_MODEL` at the candidate path and keep the target phrase unchanged. Only after review copy it to `.voice/wakeword-models/hey_angklobot.onnx` and restart the service.

### Upstream model training for better generalization

Follow the [openWakeWord automated training notebook](https://github.com/dscripka/openWakeWord/blob/v0.6.0/notebooks/automatic_model_training.ipynb) and [custom configuration](https://github.com/dscripka/openWakeWord/blob/v0.6.0/examples/custom_model.yml). These can be run on your own suitably provisioned training machine; the runtime does not depend on Colab or another hosted service.

Set `model_name: hey_angklobot` and `target_phrase: ["Hey Angklobot"]`. Generate diverse positives with the [upstream Piper sample generator](https://github.com/dscripka/piper-sample-generator), verify pronunciation manually, and supply background noise, room impulse responses, negative feature data, and separate false-positive validation data. Upstream recommends large synthetic datasets; the custom config recommends at least 20,000 positives, and the pretrained models used very large negative corpora. Respect the datasets' licenses.

The pinned trainer's stages are:

```bash
python openwakeword/train.py --training_config hey_angklobot.yml --generate_clips
python openwakeword/train.py --training_config hey_angklobot.yml --augment_clips
python openwakeword/train.py --training_config hey_angklobot.yml --train_model
```

Run those in the upstream checkout with the dependencies and assets from its notebook. Its `full` extra includes old TensorFlow/ONNX conversion dependencies and its Piper workflow is not a verified one-command Apple Silicon setup. Do not install that stack into the inference environment. ONNX export is followed by a TFLite conversion that the Mac runtime does not need; a TFLite failure is not proof that the preceding ONNX model is valid—validate it independently. This project prepares a native CPU alternative above instead of patching upstream CUDA/TensorFlow scripts.

## Acceptance and tests

Once a trained model exists: start the four services, open `http://localhost:3000/guest`, turn **Hey Angklobot: On**, grant browser/Terminal microphone access, and wait for **Listening for “Hey Angklobot”**. Say **Hey Angklobot** without pressing Mic; wait for **Listening to command**; say **What songs can you play?** once. Expect one transcript, one AI reply, one spoken response, then wake listening again. Repeat with Bahasa Indonesia selected and **Lagu apa yang bisa kamu mainkan?** after the same wake phrase.

Also test Off during listening, cancellation, muted TTS, manual Mic, typed chat, reload, a second tab, unplugged input, permission denial/revocation, service interruption, and speaking the phrase during TTS. Check that no detector stream remains open after Off/tab close. Browser/OS microphone permission and real speaker playback must be tested by the operator.

```bash
cd frontend
npm test
npm run build
cd ..
.voice/wakeword-venv/bin/python -m pip install -r requirements.txt
.voice/wakeword-venv/bin/python -m pytest -q
```

Frontend tests exercise real React Strict Mode with controlled microphone/AI/TTS doubles; protocol tests use a fake detector explicitly, not a pretend trained wake model. They validate orchestration and cleanup, not recognition accuracy. The existing Python environment may skip the wake-word tests if its optional runtime dependencies are absent; use the isolated wake environment to run the complete set.

Nothing here changes Arduino, motor control, Firebase, mobile support, or song queues.

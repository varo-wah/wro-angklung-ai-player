# Wake-word change review

Branch: `codex/hey-angklobot-wake-word`. Changes are local and uncommitted; nothing has been pushed or merged.

## Current implementation

The Guest toggle now uses the shared browser recorder and local Whisper endpoint. It records short speech segments, accepts a close whole-utterance match to “Hey Angklobot,” suspends before the existing command/AI/TTS flow, and resumes after the response. Manual Mic controls retain their existing handler and recording defaults. No training, secret, model download, or separate wake service is needed.

The native openWakeWord process on port 8765 was stopped. Its earlier scripts, source, tests and training research are preserved as deferred work and are not imported by the Guest prototype.

## Relevant changes

- `frontend/src/lib/wakeWord.ts:4`: whole-phrase normalization and bounded edit matching; line 25 starts the single-owner Whisper recording loop, with cancellation and stale-result guards.
- `frontend/src/hooks/useWakeWord.ts:10`: optional enable, permission cleanup, saved preference without microphone auto-start, pause/resume, and last-heard readout.
- `frontend/src/hooks/useVoiceAssistant.ts:51`: wake activation enters the existing recorder flow. Lines 75 and 104 pause wake listening before TTS and command/typed requests. Muting/cancellation prevent stale spoken replies.
- `frontend/src/lib/voice.ts:38`: optional recording limits for wake segments; defaults preserve manual capture. Track failure, cancellation during permission, and initialization cleanup release microphones.
- `frontend/src/app/api/speech/transcribe/route.ts:27`: wake requests require a loopback Whisper URL. Line 49 disables previous-audio context for all independent recordings, fixing the repeated earlier phrases observed in the browser. Client cancellation propagates upstream.
- `frontend/src/app/guest/page.tsx:174`: optional toggle and status; last-heard text is bounded to avoid a hallucinated long transcript expanding the layout.
- Frontend tests exercise matching, silence, loop cancellation, stale responses, local-only routing, no-context behavior, React Strict Mode, Mic use, Indonesian commands, mute and TTS resume.

## Validation

- `npm run build`: passed, including Next.js type checking.
- `npm test`: 18 passed.
- `.voice/wakeword-venv/bin/python -m pytest -q`: 57 passed; no training executed.
- `git diff --check`: passed.
- Real local Whisper endpoint: the synthetic wake sample returned “Hey Angklobot.” after the no-context fix; a subsequent JFK sample returned the correct unrelated text. The initial repeated “Uncle about” result motivated the fix.
- Browser UI: wake mode enabled with the existing microphone permission, entered “Listening for Hey Angklobot,” suspended during an actual spoken reply, returned to listening, and disabled successfully. Final page is left with wake mode off for explicit user activation.
- Live AI requests returned HTTP 200 using the existing local configuration. Whisper, Ollama and the frontend remain running.
- Recognition accuracy with the user's own voice and the room's acoustic conditions still needs the manual test described in `docs/wakeword-macos.md`.

## Complete local file inventory

This includes the earlier deferred native implementation as well as the active Whisper prototype. No Arduino, motor, Firebase deployment or queue code was changed.

- `README.md`
- `docs/wakeword-change-review.md`
- `docs/wakeword-macos.md`
- `docs/wakeword-openwakeword-deferred.md`
- `frontend/package-lock.json`
- `frontend/package.json`
- `frontend/src/app/api/speech/transcribe/route.ts`
- `frontend/src/app/guest/page.tsx`
- `frontend/src/hooks/useVoiceAssistant.ts`
- `frontend/src/hooks/useWakeWord.ts`
- `frontend/src/lib/voice.ts`
- `frontend/src/lib/wakeWord.ts`
- `frontend/tests/load-typescript.cjs`
- `frontend/tests/speech-endpoint.test.cjs`
- `frontend/tests/voice-lifecycle.test.cjs`
- `frontend/tests/voice-recorder.test.cjs`
- `frontend/tests/wake-word.test.cjs`
- `scripts/prepare_wakeword_models.py`
- `scripts/requirements-wakeword-training.txt`
- `scripts/requirements-wakeword.txt`
- `scripts/setup_wakeword_macos.sh`
- `scripts/start_wakeword_macos.sh`
- `scripts/train_wakeword_local.py`
- `src/wakeword/__init__.py`
- `src/wakeword/detector.py`
- `src/wakeword/service.py`
- `tests/test_wakeword.py`
- `tests/test_wakeword_training.py`

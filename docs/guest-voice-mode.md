# Guest cleanup and mobile Voice Mode

Feature branch: `codex/guest-mobile-voice`. Local changes only; no commit, push, merge, deployment or hardware test.

## Architecture and main files

- `frontend/src/app/guest/page.tsx:9`: compact chat presentation, Clear Chat, internal conversation scroll and scroll-to-latest effect. Song browsing now lives in the scrolling region; it cannot expand the footer.
- `frontend/src/app/voice/page.tsx:5`: transcript-free Voice Mode, original lime/emerald orb, state label and essential controls.
- `frontend/src/components/VoiceControls.tsx:5`: shared Mic, wake toggle, mute, language, cancel/stop controls and voice-state presentation. CSS animations use transforms and opacity, with reduced-motion support; they reflect state rather than measuring microphone amplitude.
- `frontend/src/hooks/useVisitorAssistant.ts:8`: both pages call the existing `useVoiceAssistant` and share provider-owned AI, catalog, conversation, selection, schedule and playback. It owns the route's exclusive voice lease and invalidates pending provider requests on unmount.
- `frontend/src/lib/voiceSessionLease.ts:2`: same-origin Web Lock prevents two tabs from running voice simultaneously. Current secure-context browsers are required; localhost remains supported. See [Web Locks specification](https://www.w3.org/TR/web-locks/).
- `frontend/src/components/AngklungSystemProvider.tsx:801`: Clear Chat resets chat input/history, pending song/reference and conversational diagnostics while retaining catalog, selection, schedule, arrangement settings and voice preferences. It publishes the empty history through existing persistence/sync. Pending results cannot refill the conversation after clearing.
- `frontend/src/components/AngklungSystemProvider.tsx:988`: manual and automatic playback use one validated start path; automatic playback receives the newly generated schedule directly rather than reading stale React state.
- `frontend/src/lib/songRequestPolicy.ts:6`, `frontend/src/lib/ai/localFallbackMatcher.ts:74`, `frontend/src/lib/ai/songRequestSchema.ts:161`: explicit title/alias requests skip confirmation; ambiguous duplicate matches ask which song; unsupported, hidden, inactive, low-confidence or recommendation-only results cannot auto-generate.
- `frontend/src/lib/ai/songRequestPrompt.ts`: aligns AI instructions with direct requests versus clarification.
- `frontend/src/app/globals.css:38`, `frontend/src/app/layout.tsx:5`: bounded visitor viewport, flex `min-height:0`, internal overflow, visual-viewport resize handling for keyboards, safe-area padding, portrait/landscape rules and lightweight orb animation.
- New frontend regression tests: `provider-conversation.test.cjs`, `song-flow.test.cjs`, `voice-session.test.cjs`, `voice-page.test.cjs`. The test loader now supports TSX and local imports.

The previous working Whisper recorder, TTS and wake matcher were not replaced or retrained. Their existing uncommitted files and the deferred openWakeWord research remain preserved from the preceding task.

## Playback behavior

An explicit supported title such as “Play Fireflies” immediately selects and generates the schedule. Payload validation and motor-safety validation still run. Automatic playback additionally requires no warnings, no draft/unsafe metadata, and no operator-review flag. The same AudioEngine, PlaybackEngine and existing serial preparation safeguards are used; no motor mappings or firmware were edited.

Only after the playback engine actually starts does the final response say “Playing [title].” If browser audio cannot start, the page retains a manual Play control. Failed validation blocks playback. Existing operator review/manual simulation remains available for warnings.

**Fireflies currently has a draft arrangement, `demo_safe: false`, and a timing warning.** It now skips “Yes,” but correctly stops for operator review instead of automatically playing. Its warning is not a conversational confirmation.

## Validation performed

- `npm run build`: passed, including type checking; `/guest` and `/voice` both built.
- Frontend suite: 30 tests passed, covering actual provider generation/playback with fake hardware/audio, validation/warning/draft blocks, stale AI/audio cancellation, persistent Clear Chat, phrase matching, microphone cleanup, Strict Mode, TTS handoff, cross-tab exclusivity and orb state rendering.
- Existing Python suite: 57 passed. No training executed.
- Browser: long existing history had approximately 18,044 px of content inside a 731 px conversation region. The document remained equal to the viewport and the composer remained at its bottom.
- Browser: Clear Chat emptied history, retained selected Fireflies, and preserved enabled wake mode. Typed “Play Fireflies” proceeded directly through generation/validation to the operator-review warning.
- Browser: `/voice` contains zero chat bubbles; manual Mic entered the listening state; wake enable entered “Say ‘Hey Angklobot’”; navigating between modes released the previous session. A second tab's Mic request was rejected while Voice Mode owned the session.
- Responsive checks: effective browser viewports included 481×1042 and 355×631 portrait, and 938×433 landscape (the in-app browser applies its own scale to requested viewport sizes). Document width/height matched the viewport; controls stayed inside it. TTS-to-speaking-orb mapping is covered by rendering tests, with the existing TTS lifecycle tests retained.
- Physical phone Safari, software-keyboard appearance and a full spoken wake → command → TTS interaction on the new page still need the manual test below. Existing local voice-stack operation was preserved, but emulation is not a physical phone test.

## Manual test

1. Keep Ollama, Whisper and Next.js running. Open `http://localhost:3000/voice` on this Mac.
2. With Wake Off, press **Mic**, say “What is an angklung?”, then pause. Expect listening → transcribing → thinking → speaking, followed by idle.
3. Enable **Hey Angklobot**. Say “Hey Angklobot” alone, wait for “Listening…”, then ask “What songs can you play?”. After the response, expect “Say ‘Hey Angklobot’” again. Choose Bahasa Indonesia to test an Indonesian command after the English wake phrase.
4. Say “Play Fireflies.” Expect direct schedule generation and its current operator-review warning, with no “Do you want me to play it?” prompt.
5. Use **Normal Chat**. Add messages and scroll history; the heading/input should stay put. Enable wake, choose language/mute preferences, then press **Clear Chat**. History clears while those preferences remain.
6. Switch pages during listening/speaking. The old capture/TTS stops and the new page starts idle; explicitly enable wake again. Open another same-origin tab while wake is active and confirm its Mic reports that voice is already active elsewhere.
7. On a phone, test portrait/landscape and keyboard opening/closing, large text, safe-area clearance and permission-denied recovery once a secure URL to the existing Mac-backed application is available.

This task adds a mobile presentation, not remote phone backend connectivity. A phone's `localhost` means the phone itself; ordinary HTTP to the Mac's LAN address cannot be assumed to provide microphone access. No Firebase or mobile remote backend deployment was configured. Microphone and cross-tab session APIs require an appropriate secure context; see [MDN secure-context guidance](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/locks).

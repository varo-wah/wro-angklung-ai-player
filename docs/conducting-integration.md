# Conducting integration — 31 October 2026

## Scope and current result

Keep the existing eighteen-note rack. A robot-mounted USB camera and external display connect to the Mac; no Jetson is required for this prototype. Studio's playlists and player can be developed independently of the camera pipeline.

This checkout contains a **personal-calibration audio prototype**, not a validated conductor or physical robot controller. `/studio/conduct` provides:

- Explicit camera selection/start/stop, mirrored video and landmark overlay, and a fullscreen stage.
- Local MediaPipe Hand Landmarker inference in a dedicated worker, with at most one frame in flight. The model and WASM are served by the Mac; no camera images are uploaded or recorded.
- Three or more landmark samples per solfège sign. A nearest-template classifier rejects unfamiliar/ambiguous poses. Its thresholds are provisional and have not been validated on real conductors.
- Seven sign shapes and two calibrated Do heights mapping to C4–C5. Fixed camera/body position and one visible hand are required. This does not yet address the full eighteen-note range, chords, or natural beat-based repeats.
- A stable sign produces one 300 ms synthesized note. To repeat it, return to an unrecognized/neutral pose for at least 250 ms. A held pose does not retrigger each frame. Recognition dwell is 180 ms. These are prototype policies, not claims about traditional conducting technique.
- Camera loss, stale results, hidden page, Escape, Stop and route exit release sound. Stop also invalidates pending permission/audio operations.
- Calibration remains in tab memory and can be exported explicitly as landmark JSON; reload clears it. There is no sample import or trained general-purpose sign classifier yet.

The shared Studio runtime enforces player-versus-conduct **audio** ownership. It does not claim a robot session, stop a legacy controller in another tab, or establish cross-tab hardware exclusivity. There are no robot transport imports in the Conduct feature.

## Parallel work and integration boundary

| Workstream | Owns | Shared boundary |
| --- | --- | --- |
| Player / playlists | Existing Studio library, queue, playlist persistence, player UI | Existing song scheduler and catalog |
| Camera conducting | `frontend/src/features/conduct/`, `/studio/conduct`, vision worker/assets and calibration data | Studio mode and note-preview actions |
| Controller integration | Mac robot-session owner, output arbitration, live-note transport, external-display state | One authoritative output owner for all input modes |

Only `StudioShell.tsx` (navigation and disabled player button) and `runtime/studioController.ts` (mode/preview actions) are shared application edit points for this slice. Merge those deliberately with ongoing playlist work. Feature CSS and camera logic stay separate.

The isolated `codex/conducting-preview` checkout began with a source snapshot of the uncommitted Studio workspace. That snapshot is a development baseline, not conducting work. On 31 October, the user requested synchronization with the player/UI chat. A three-way merge against that snapshot brought in the latest themes, sizing, queue resizing, and player tests while retaining Conduct's navigation and mode ownership. Conduct's surfaces and typography now follow the same saved appearance choices.

`Software Releases/angklobot-conducting` is now the shared Studio working directory. Port 3011 runs `dev:studio` here, and the existing port 3012 `dev:conduct` preview reads the same source with a separate build cache. These are two browser origins, not shared live queue sessions. Keep further Studio work in this checkout or explicitly port feature commits; there is no automatic cross-chat or cross-worktree merge. The former hidden Studio checkout and the original dirty main controller checkout remain preserved.

## Run

```sh
cd frontend
npm ci
npm run dev:conduct
```

Open `http://localhost:3012/studio/conduct` on the Mac. Camera access is requested only after Start camera. Capture the selected signs with the same hand, establish lower/upper Do heights, then explicitly enable sound preview. Use the fullscreen stage on the robot's extended display.

`npm ci` runs `prepare:vision`: it copies the pinned npm runtime and downloads Hand Landmarker model version 1 if needed, checking its SHA-256. Installation needs internet; the prepared camera pipeline does not need a CDN or internet at runtime. A cached valid model is reused. Generated model/WASM assets are ignored by Git and must be included in any deployable bundle. Model checksum: `fbc2a30080c3c557093b5ddfc334698132eb341044ccee322ccf8bcf3607cde1`.

## Next integration milestones

1. Test the actual mounted camera with the intended conductor. Record sign confusion, unintended attacks, tracking loss, frame age, and gesture-to-sound latency while voice services run. Use held-out recordings/sessions; adjacent frames from one recording are not independent validation data.
2. Replace or improve the personal templates using those observations. Confirm the actual conducting convention, beat/repeat behavior and octave policy. Body-relative calibration and a proper trained classifier may be needed; current screen-relative height is only a first prototype.
3. Introduce one Mac-owned live-output service that accepts validated note events and arbitrates song/conduct ownership. Preserve explicit arming, expiry, duration/strength limits, stop priority, no replay of stale events, and diagnostics. Preview success must never silently authorize motors.
4. Connect direct Mega USB first, after wiring/calibration and powered-stop checks. The current ESP32 adapter preloads songs and its `sendNote` method does not transmit live events; implement and test an explicit live-note mode before enabling either ESP32 transport for conducting.
5. Expose recognized note, mode and connection state through the shared session for a second display. The current fullscreen option is a single-window preview, not synchronized multi-window display state. Reuse existing phone pairing; do not introduce an independent motor owner on the phone or display.

## Verification

After the player/UI synchronization, all 43 focused Studio/conducting tests and the production build pass. Additional browser checks covered shared themes/sizing, five-item navigation at 320px and 140% sizing, and stopping song playback on entry to Conduct. This check did not activate a camera or robot output.

- TypeScript and the production build passed.
- All 40 focused conducting/Studio runtime tests passed, including late permission cancellation, one-frame backpressure, duplicate-note filtering, ambiguous samples, mode ownership, pending audio cancellation, and existing queue behavior.
- Full suite: 208/210 passed. The `you_are_the_reason.json` balance snapshot and Fireflies ambiguity expectation also fail in the original Studio checkout; they were not changed here.
- Browser verification used generated video and a blank synthetic frame, not a physical camera. Local worker/model initialization succeeded, empty frames produced no hand detections, Stop ended the synthetic track, and the camera stream was detached.
- Browser checks also confirmed permission-denied recovery, return to Player mode, and five navigation items without horizontal overflow at a 390 px viewport. Synthetic camera overrides were removed after testing.
- Real camera accuracy, full gesture-to-sound delay, physical actuation and noisy venue operation remain unverified.

Implementation references: [MediaPipe web hand tracking](https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker/web_js), [official model overview](https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker).

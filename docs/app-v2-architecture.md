# Angklobot app V2: architecture and release path

Status: first browser preview milestone, 2 October 2026. This is an application foundation alongside the existing controller. It is not a shipped native app, a hosted customer service, or evidence of physical robot operation.

## Shared Studio checkout — 31 October 2026

The player/UI and Conduct branches are now combined in `wro-angklung-ai-player/.worktrees/angklobot-conducting` (`codex/conducting-preview`). Both local preview servers, ports 3011 and 3012, use that working directory with separate build caches. The hidden `angklobot-app-v2` checkout is preserved as the earlier UI version; the original main controller checkout remains unchanged. Future Studio edits should use the shared directory or be deliberately integrated from a feature checkout. Browser sessions, queues, and per-origin preferences are still separate across ports.

Integration checks: 43 focused Studio/conducting tests and the production build pass. Browser verification covered both themes on Conduct, the five-item phone navigation at 320px and 140% sizing, song-to-Conduct audio ownership, and return to Player. Camera capture and robot output were not enabled during this integration check.

## Puerto Rico desktop player pass — 31 October 2026

The current priority is a Mac-operated performance interface, retaining the existing phone connection flow. Commercial packaging and camera conducting are deferred.

`/studio` now opens the desktop player: searchable library, collection/favourite/recent filters, selected song, and an editable queue. The persistent player adds previous/next, shuffle, repeat one, and repeat all. Upcoming entries can be reordered or removed, and repeated occurrences of the same song are supported. Selecting a library song replaces the current selection while preserving upcoming entries. Playback started explicitly by the user advances through the queue; loading the app, selecting a song, or advancing while paused never starts playback automatically.

The queue and repeat/shuffle settings remain within the current Studio session and are not restored after reload. Stop, pause, seek, arrangement changes, new selection, and disposal invalidate pending automatic transitions. A failed arrangement stops progression and reports its error. Turning shuffle off restores addition order for upcoming entries; manually reordering turns shuffle off.

This remains a computer-audio preview. The Studio route boundary, original controller, firmware, pairing endpoints, and existing phone interface were not changed by this pass. No robot connection, firmware upload, or physical playback is claimed. Integrating the approved player with the existing Mac controller is the next milestone.

Studio also has saved light/dark themes and 100–140% interface sizing, with a larger 120% default. The top bar exposes theme and size controls on desktop and phone; Preferences provides the same choices plus a sizing reset. Text and control sizes adapt without changing browser zoom. The desktop queue divider supports dragging, arrow keys (Shift for larger steps), Home/End, and double-click reset; widths are bounded to preserve room for the library. The player uses the full available workspace width, with narrow layouts stacking the queue below the library. Appearance updates do not interrupt playback. Validated theme and size preferences are applied before first paint to avoid a light-theme flash on reload.

Verification: all 35 Studio runtime tests pass, including queue completion, repeated entries, shuffle cycles, repeat modes, stale loads, cancelled transitions, unavailable audio, navigation lifecycle, appearance preference migration, and uninterrupted playback during appearance changes. The production build passes. Browser checks covered search, queue addition/reordering/removal, shuffle and repeat controls, next/stop playback, queue retention across Studio navigation, theme and sizing persistence, pointer/keyboard resizing, and desktop/phone layouts. Maximum sizing was checked at 320, 390, 1024, and 1440 CSS pixels without horizontal overflow; actual phone pairing was not retested.

## Product direction

An app-like interface is useful only if its capabilities have clear owners. Keep the song and schedule rules reusable, place platform access behind small interfaces, and retain one authoritative controller for each robot. A mobile wrapper cannot by itself replace the Mac server, browser serial connection, local speech service, or single-process session store.

The first milestone is an isolated `/studio` experience for browsing the existing catalog, selecting arrangements, building and validating schedules, and previewing them through browser audio. Its device view hands off to `/control` through a normal same-tab document navigation. Hardware operation remains in the existing controller while the new runtime becomes independently testable.

## Current-code audit

Line references below describe the baseline inspected for this milestone. Later edits may move them.

| Finding | Source | Architectural consequence |
| --- | --- | --- |
| The root layout wraps every route in the existing provider. | `frontend/src/app/layout.tsx:20` | Put an explicit route boundary above the provider so `/studio` does not start its side effects. |
| The 1,666-line provider mixes application state, transport, AI, speech, storage, synchronization, and rendered navigation. | `frontend/src/components/AngklungSystemProvider.tsx:185`, `:1544` | Do not embed the V2 shell inside the existing provider or duplicate its hardware implementation. |
| Guest/operator behavior depends on exact pathnames, while non-localhost control defaults to the Mac. | `frontend/src/components/AngklungSystemProvider.tsx:295`, `:879` | New runtime behavior needs explicit capabilities and mode instead of inheriting route-name rules. |
| Song types, schedule construction and validation already have narrow boundaries. | `frontend/src/lib/songTypes.ts:4`; `scheduleBuilder.ts:13`; `scheduleValidator.ts:19`; `safetyValidator.ts:16` | Reuse these rules rather than create a second arrangement or validation implementation. |
| Catalog and arrangement fetching is root-relative and coupled to global `fetch`. | `frontend/src/lib/songCatalog.ts:3`; `songLoader.ts:4` | A library adapter can later load bundled files, authenticated downloads, or a different service base URL. |
| There is already a transport contract for USB and ESP32. | `frontend/src/lib/robotTransport.ts:6` | Future hardware migration should adapt this contract, preserving disconnect, disarm, and cancellation behavior. |
| The default rack is 18 natural notes and serial channels are limited to 0–17. | `frontend/src/lib/instrumentMap.ts:7`; `arduinoSerial.ts:6` | A future 30-note rack requires a verified hardware profile and firmware/protocol changes; a screen label is insufficient. |
| Direct serial requires secure-context browser serial; playback uses browser timers. | `frontend/src/lib/arduinoSerial.ts:41`; `playbackEngine.ts:22` | Native and mobile support require explicit transport and lifecycle implementations. |
| ESP32 buffers schedules, but browser keepalives still govern operation. | `frontend/src/lib/esp32Transport.ts:103`, `:137` | Suspension, lock-screen behavior, network loss, and lease expiry require physical validation before mobile control is claimed. |
| Robot sessions allow one controller per process and store state in memory. | `frontend/src/lib/robotSessionStore.ts:10`, `:131` | Deploying multiple server instances does not create independent customer/device sessions. |
| Wireless control is restricted to localhost and may read a token from a firmware header. | `frontend/src/app/api/robot/wireless/route.ts:10`, `:32` | This is a local bridge service, not a portable mobile or cloud API. |
| AI and transcription default to services on the Mac. | `frontend/src/app/api/ai/song-request/route.ts:34`; `speech/transcribe/route.ts:26` | Their deployment, configuration, failure modes, and costs must be designed separately from the UI. |
| The AI endpoint has no caller authentication or per-customer quota enforcement. | `frontend/src/app/api/ai/song-request/route.ts:34` | Add an authenticated service boundary and usage controls before exposing paid-provider access publicly. |
| Catalog metadata describes playability and review status but has no distribution-rights contract. | `frontend/src/lib/songTypes.ts:4` | Record content provenance and permitted distribution before selecting the commercial catalog; technical playability does not establish distribution rights. |

## First milestone boundary

The implemented runtime dependency direction is:

```text
/studio screens
  -> Studio application runtime and feature state
     -> library port -> current catalog/arrangement assets
     -> preference port -> Studio-specific local browser storage
     -> preview output port -> browser audio and playback clock
     -> existing song, schedule and validation functions

/control, /guest, /voice, /display
  -> existing provider and controller stack
     -> existing robot transport, session, AI and speech services
```

The first runtime is implemented in these inspected modules:

| Responsibility | Implementation |
| --- | --- |
| Exclude the legacy provider from `/studio` and its descendants. | `frontend/src/components/LegacySystemBoundary.tsx:11` |
| Keep one Studio provider across child routes. | `frontend/src/app/studio/layout.tsx:11` |
| Define repository, preference, audio, and playback interfaces. | `frontend/src/features/studio/runtime/ports.ts:5` |
| Manage catalog/selection state, explicit playback, validation, cancellation, and subscribers independently of React. | `frontend/src/features/studio/runtime/studioController.ts:29` |
| Load catalog data using existing loaders and connect preview ports to existing browser audio/scheduling. | `frontend/src/features/studio/runtime/browserAdapters.ts:9` |
| Parse versioned preferences under the isolated `angklobot.studio.preferences.v1` key. | `frontend/src/features/studio/runtime/preferences.ts:3` |
| Bind the runtime to React using `useSyncExternalStore` and dispose it on final unmount. | `frontend/src/features/studio/runtime/useStudio.tsx:9` |

The controller discards obsolete song loads (`studioController.ts:103`), requires an explicit play action (`:123`), cancels pending audio initialization when playback is invalidated (`:134`), pauses when seeking (`:182`), and invalidates its catalog/selection/playback work on disposal (`:230`). Preferences contain no playback command/state. Hardware-trial catalog entries are excluded from preview (`:73`). These source checks describe implementation, not a claim about audible output or real hardware.

The milestone includes responsive navigation, a persistent player, library browsing, local preferences, and clear device handoff. Browser-local preferences are convenience state, not accounts, backups, cross-device synchronization, or proof of offline support. Preview audio is synthetic software output, not a recording of the robot or a physical-playback check.

It deliberately excludes robot discovery/control in Studio, account creation, payments, cloud synchronization, commercial catalog distribution, native binaries, background playback guarantees, and a production deployment. Keeping these out of the first implementation prevents an attractive screen from implying capabilities the system does not yet have.

## Lifecycle and safety obligations

The route boundary is an ownership boundary, not a physical emergency stop.

1. **Entering Studio must not mount the legacy provider.** Check the exact `/studio` route and its descendants, with segment matching rather than a broad string prefix. A fresh Studio page must not create a serial controller, restore a robot token, join the legacy snapshot channel, or probe AI/speech services.
2. **Cross-runtime navigation must replace the document.** The Studio device handoff uses `<a href="/control">`, not a Next.js client link. Any future legacy-to-Studio entry must also use full-document navigation until the legacy lifecycle is explicitly refactored and tested. Normal links within Studio remain client navigation so the preview runtime persists. The baseline legacy cleanup only disconnects an already connected transport (`AngklungSystemProvider.tsx:415`) and session cleanup halts only a host (`useRobotSession.ts:106`); a simple React unmount is therefore insufficient for the non-host and in-progress-connect cases. This milestone does not rewrite the legacy provider.
3. **Hardware teardown is best effort until acknowledged.** Existing serial disconnect issues `ALL_OFF` and `DISARM` before closing (`arduinoSerial.ts:254`), but asynchronous unmount cleanup cannot establish that physical outputs stopped. Route navigation must not display a confirmed hardware-stop state based only on component teardown. Operator stop, transport response, and hardware behavior are distinct evidence.
4. **Same-tab handoff replaces the preview document.** The Studio runtime must still dispose its own audio/timers and invalidate pending selection/audio work when unmounted. The full-document link does not close or control other tabs. A separate legacy tab may still own a physical robot; Studio must not claim exclusive hardware ownership. Document unload also cannot guarantee delivery of a final asynchronous hardware command.
5. **Preview preferences must not mutate controller state.** Use a separate storage namespace and avoid writing legacy transport settings, pairing credentials, or system snapshots. Never restore `playing` as an automatic action.
6. **Preserve review status.** A passing software validator establishes only the implemented checks. Keep draft/physical-review metadata visible where relevant and do not relabel an arrangement as commercially cleared or physically verified.

## Verification for this milestone

Record completed checks in the delivery report; this document is not a claim that they passed.

- Verify Studio catalog loading, search/filter, song selection, schedule generation, preview start/pause/stop, seek, and error/retry states.
- Exercise rapid selection changes and stop/navigation while arrangement loading or audio initialization is pending. A late completion must not restart playback.
- Verify the dependency/runtime boundary: Studio does not issue robot/session, wireless, AI, or transcription requests or open serial access.
- Verify Studio-to-controller handoff and controller-to-Studio cleanup; distinguish commanded teardown from any hardware acknowledgement.
- Check narrow and wide viewports, keyboard access, visible focus, touch controls, readable status text, and long song titles.
- Run the existing regression suite and production build, plus focused tests for new state transitions and adapter failures. Existing ownership/cancellation tests in `frontend/tests/robot-session.test.cjs:15` and `provider-conversation.test.cjs:39` remain valuable gates.
- Treat audible output, actual robot operation, installability, offline behavior, and native packaging as separate checks. A successful build does not establish them.

## Prioritized conversion and production plan

### 1. Stabilize a complete preview flow

Finish the first milestone with one consistent application state model, cancellation semantics, clear errors, and a narrow dependency graph. Validate it on target browsers and real screen sizes. Extract additional shared code only when it removes a concrete dependency or duplication. Retain the existing controller during this stage.

### 2. Decide the first supported product and platform

Choose whether the first paid product is a desktop robot controller, a mobile companion to a local controller, or a software-only music application. These have different transport, support, and distribution requirements. Document the supported operating systems, robot/firmware versions, connection modes, and offline expectations before selecting a packaging tool.

For a desktop controller, prototype native serial and local-service management behind the ports. For a mobile companion, define authenticated communication to an authoritative controller and test suspension/reconnection. For an installable browser app, explicitly implement and verify the chosen cache/update behavior. Keep device commands, pairing state, and live status outside generic offline-response caches. Do not describe any route as native or fully offline until an actual package and failure-mode tests exist.

### 3. Separate device control from application services

Keep the robot's authoritative command execution, leases, stop priority, watchdogs, and no-replay behavior near the device. Create explicit service contracts for catalog access, account data, AI, and transcription. Replace firmware-header token discovery with an installation/provisioning mechanism. Introduce hardware profiles only after matching real rack mapping and firmware capabilities.

Migrate the existing `RobotTransport` implementations incrementally with protocol regression tests; do not implement a second serial stack in the Studio UI. Test disconnects, rejected commands, stale sessions, interrupted schedule upload, and update/restart recovery on the actual hardware.

### 4. Establish customer and content readiness

Add account/device ownership, authenticated pairing, revocation, authorization checks, per-customer service limits, and operational diagnostics appropriate to the chosen product. Decide what data is retained, where it is stored, how it is deleted/exported, and whether recordings are ever persisted. Require evidence for those behaviors rather than policy text alone.

Create a provenance record for each distributed score, MIDI source, arrangement, audio asset, and other bundled content; identify the intended commercial use and obtain appropriate review/permissions where needed. This document makes no determination about any particular song's legal status. Choose pricing only after measuring hosting/AI costs, support load, and the scope of what the customer receives.

### 5. Prepare a small release that can be supported

Build the chosen package, configure signing and distribution as required by that channel, and test installation, upgrade, rollback, and removal on supported systems. Define compatible app/bridge/firmware versions and safe behavior when they differ. Ship an onboarding flow that checks actual connection and service readiness.

Before a customer pilot, have a recovery path for failed updates, an actionable diagnostics export, a support/contact process, installation documentation, and a reproducible release build. Establish ownership for security fixes, dependency updates, lost-device revocation, and customer data requests. Only then evaluate a wider paid release or store submission against the current requirements of the selected channel.

## Development snapshot and measured results

The `codex/angklobot-app-v2` worktree starts from commit `1ad6c93` plus a separate copy of 41 locally changed source files. Those copied song, voice, USB and firmware changes predate Studio; they are retained as the current development baseline, not attributed to this milestone. Generated firmware builds and ignored private configuration were not copied. The original checkout remains the source for that ongoing work.

Commands: `npm run dev:studio` serves the new workspace on port 3011; open `/studio`. `npm run build:competition` builds both the legacy routes and Studio. A production preview can be started with `ANGKLOBOT_DIST_DIR=.next-competition npm start -- --hostname 127.0.0.1 --port 3011`.

Measured checks on 2 October 2026:

- All 20 Studio runtime tests pass, including stale song loads, pending audio cancellation, stop/dispose behavior, corrupt/unavailable storage, muted playback, and React Strict Mode effect replay.
- The 42 musical catalog entries pass all 168 combinations of arrangement mode and tempo through schedule and motor validation; four configurations retain non-blocking timing warnings.
- The original regression baseline is 168/170 passing. The final full v2 run is 188/190, with the same two existing failures: the `you_are_the_reason.json` balance snapshot and the Fireflies ambiguity expectation.
- TypeScript and the production build pass. The existing standalone lint script invokes first-run ESLint configuration and does not provide an unattended lint baseline.
- Browser checks exercised selection, start/pause, route persistence, favourites, search, saved tempo after reload, mobile navigation at a measured 391px width with no horizontal overflow, and full-document handoff to the operator console and back. Production browser logs showed no warnings or errors. No audible quality, physical motor behavior, or native package was verified.

A new deployment must configure the required legacy services explicitly; copied source alone does not copy the original machine's ignored credentials or prove hardware connectivity.

Platform references for later packaging decisions: [Capacitor documentation](https://capacitorjs.com/docs) and [MDN Web Serial availability and permissions](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Permissions-Policy/serial). These describe platform boundaries; neither is evidence that Studio has been packaged or tested on native devices.

# Shared Mac controller and pairing

For the unified USB/ESP32 competition startup on port 3002, use [Competition runbook](competition-setup.md). The notes below describe pairing and the older USB/mobile development mode.

## One controller, multiple paired devices

Run one Next.js Node server on the Mac. Open `http://localhost:3000/control` in Chrome, click **Enable Mac controller**, then **Connect Arduino** and choose the Mega. The enable action unlocks browser audio and claims the server session; USB is reported connected only after the existing serial handshake succeeds. Keep this tab open and the Mac awake.

The status bar distinguishes the Mac controller being online from its Arduino being connected, including dry-run output mode. A connected status is a software handshake, not proof of wiring or motor motion.

Phones, another computer, and audience tabs must access this same Next.js server. Use the current HTTPS tunnel URL for phone microphone access, or the Mac's reachable LAN address for controls without microphone access. `localhost` on a phone points to the phone, not the Mac. A separately hosted Firebase page does not share this session.

Enter the six-digit code displayed in the Mac status bar on each additional device/tab. Paired devices can request songs, select/generate songs, play, pause, stop, reset, and run the existing wake greeting. The Mac validates and schedules requests and owns all USB output. Visitor speech is transcribed through the existing server routes and spoken on the requesting device; queued song playback begins after that device's spoken reply completes. Ordinary conversational replies do not enqueue playback.

Arrangement settings, advanced schedule uploads, and connecting/disconnecting USB remain Mac operator actions. The status and current song/playback summary are visible before pairing; detailed snapshots and command submission require a session token. Remote pages never silently replace robot playback with a local simulation when the Mac or USB disconnects.

## Startup

1. Start Ollama and Whisper using the existing voice setup instructions.
2. From `frontend/`, run `npm run build` and `npm start`. Do not build concurrently with another Next.js process using the same `.next` directory. `npm run dev` is available for development; rebuilds/restarts can invalidate a session.
3. On Mac Chrome, open `/control`, enable the controller, and connect USB. Complete the separately required wiring and powered-hardware checks before playback.
4. Start the HTTPS tunnel to this server if using phones remotely. Open its `/guest` or `/voice` URL, then pair using the Mac code.
5. Open `/display` on the audience screen and pair it with the same code. Test a request, Stop, and the displayed state before a demonstration.

## Failure and recovery

- Heartbeats run approximately twice per second. After five seconds without a heartbeat the server marks the controller offline, invalidates device tokens, and cancels queued commands. The browser also stops/disarms when it detects loss of its server lease. Network loss may prevent delivery of a remote Stop; retain the physical power cutoff.
- A queued command expires after eight seconds. Delivery is at most once within a session: a lost acknowledgement is not permission to replay the command automatically.
- Stop, pause, reset, and cancellation preempt queued work; late AI or speech callbacks cannot restart a cancelled pending song. A Mac operator stop also cancels outstanding server commands.
- USB disconnect stops the host playback path and cancels outstanding commands. Reconnect USB on the Mac. The shared status updates after the next heartbeat.
- After the Mac controller tab closes, the server restarts, or its lease expires: enable the controller again and pair devices again using the new code. No previous command queue is restored.
- Only the localhost browser can claim the controller role. Pairing tokens remain private to each paired tab's session storage. Do not share the code beyond intended operators/visitors.

## Runtime scope and verification

This implementation uses an in-memory session in a **single persistent Node process**. It is intended for the Mac-hosted application, including a tunnel terminating at that Mac. It is not a multi-instance/serverless coordination service. A dedicated shared store would be required before deploying that topology.

Tests cover ownership, pairing, expiry, command deduplication, sender-bound results, stop priority, queued-command cancellation, USB loss, two independent React clients, state mirroring, and host/remote playback routing. Simulated serial tests and a successful web build do not verify the installed Mega firmware, phone microphone, electrical mapping, or physical playback.

The existing pin-42 mapping conflict remains unchanged. Do not infer electrical readiness from a green connection badge.

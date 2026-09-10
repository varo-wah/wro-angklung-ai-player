# Mobile access to local Angklobot

The shared controller implementation is described in [Operating configuration](operating-configuration.md). Enable the Mac controller on localhost and pair remote devices with its code. The startup steps below still apply; the dated verification snapshot at the end is historical.

## Requirements

- Mac with this repository, Node/npm dependencies installed in `frontend/`, Ollama, and the existing whisper.cpp setup (`scripts/setup_voice_macos.sh` if not installed).
- Install Cloudflare Tunnel CLI if needed: `brew install cloudflared`.
- iPhone/iPad Safari or supported desktop Chrome, microphone, and internet access on both devices. Keep the Mac awake and services running.
- No paid cloud AI, OpenAI key, Firebase deployment, ESP32, or phone USB control is required.

Audio flow: phone recorder → same-origin `POST /api/speech/transcribe` → Mac whisper.cpp → transcript → same-origin `POST /api/ai/song-request` → Mac Ollama when conversational routing needs it → phone response. The phone never fetches Mac loopback addresses directly. Cloudflare transports the audio/requests; AI inference remains on the Mac.

## Start services on the Mac

From the repository root, run each long-running process in its own terminal. Skip a service already running on its expected port.

```bash
ollama serve
```

In another terminal, download the configured model if missing:

```bash
ollama pull llama3.2:latest
```

Start the existing local Whisper server from the repository root:

```bash
scripts/start_voice_macos.sh
```

Ensure these server-only settings in `frontend/.env.local` (preserve other settings):

```dotenv
AI_PROVIDER=local_ollama
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_SONG_REQUEST_MODEL=llama3.2:latest
WHISPER_SERVER_URL=http://127.0.0.1:8080
```

Do not prefix these with `NEXT_PUBLIC_`. Restart Next.js after changing settings.

Website terminal 1, from the repository root:

```bash
cd frontend
npm run dev
```

Confirm it reports port **3000**. If it selects 3001 because 3000 is occupied, resolve the existing process first so the tunnel reaches the intended app.

Website terminal 2:

```bash
cloudflared tunnel --url http://localhost:3000
```

Use the generated `https://…trycloudflare.com` URL. `/guest`, `/control`, and `/display` are all served through this URL. The Next.js development configuration permits `*.trycloudflare.com` origins for development assets. No LAN binding changes are needed for a tunnel running on the same Mac.

The quick tunnel URL is public and temporary: share only with testers and stop cloudflared with Ctrl+C afterward. It exposes this development website, including its API routes; it does not add authentication. Do not tunnel Whisper or Ollama ports separately.

## Test on iPhone/iPad

1. Open the generated HTTPS URL plus `/guest` directly in Safari, not an embedded browser.
2. Expand **Development · Local services**. Website server, Whisper, and Ollama should be available. Refresh after starting a missing service. A missing configured model is reported separately; reachability alone does not prove inference works.
3. Select English, tap the microphone button, and allow microphone access. Say **“Play Bengawan Solo”**, then pause.
4. Expect the transcript and Angklobot's song response on this phone. Existing catalog validation/confirmation still applies. This command may be handled deterministically without an Ollama inference request.
5. To test Ollama as well, ask **“Why do people enjoy making music together?”**. Confirm the response comes back and the Mac Next.js terminal reports the local Ollama provider without fallback. A fallback reply alone does not prove Ollama succeeded.
6. Spoken output depends on Voice being enabled and browser speech support. Text is the primary success check. Keep the page foregrounded; background/locked-screen listening is not guaranteed.
7. Enable the controller in Mac Chrome on localhost, connect Arduino, then enter its pairing code on the phone and audience screen. Confirm that each device shows the Mac USB status and current song.

Paired `/guest`, `/voice`, `/control`, and `/display` pages mirror the Mac controller through `/api/robot/session`. The Mac owns physical scheduling and USB; phones send validated actions to it. BroadcastChannel/localStorage remain a local simulator fallback only when no shared controller is in use. Use the same Mac-hosted server on every device; an independent Firebase deployment cannot control this session.

## Troubleshooting

- **Microphone missing/denied:** use HTTPS, allow microphone in the browser's site permissions, reload and tap Mic again. Permission belongs to each temporary tunnel hostname. Safari and Chrome remain supported where their recording APIs are available.
- **Tunnel 502/site unavailable:** confirm Next.js is listening on 3000 and both processes are running. Test `http://localhost:3000/guest` on the Mac. Do not enter localhost on the phone.
- **Assets blocked:** restart Next.js after the config change. Use the current tunnel URL; quick tunnel addresses change between sessions.
- **Quick tunnel fails to start:** check whether an existing `~/.cloudflared/config.yaml` conflicts with quick tunnels; preserve it before temporarily moving it aside.
- **Whisper unavailable:** restart `scripts/start_voice_macos.sh`; check `curl http://127.0.0.1:8080/` on the Mac. Verify the model/setup script completed and port 8080 is free.
- **Ollama unavailable/model missing:** check `curl http://127.0.0.1:11434/api/tags`, start Ollama, and pull the configured model. Slow model startup can trigger the existing 15-second AI timeout; retry after warm-up. Confirm `AI_PROVIDER=local_ollama`.
- **HTTP 503 from status:** intentionally means upstream unavailable. Check `/api/speech/status` and `/api/ai/status` through the tunnel; neither returns private service URLs.
- **No debug section:** it is development-only and is hidden in `npm run build` / `npm start`.
- **No Mac display update or robot motion:** check the shared status bar, enable the controller on Mac localhost, pair the device, and connect Arduino on the Mac. An offline/disconnected command is rejected rather than run as a local simulation.

## Validation commands

From `frontend/`:

```bash
npm run build
npx tsc --noEmit
npm test
```

`npm run build` is the package's build command (`npm build` is not the intended npm script invocation). Run build before the standalone type check so Next.js generated route types exist.

References: [Next.js development origins](https://nextjs.org/docs/app/api-reference/config/next-config-js/allowedDevOrigins), [Cloudflare Quick Tunnels](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/).

## Verification snapshot — 2026-09-07

- `npm run build` and `npx tsc --noEmit` passed.
- Focused service-status, speech-endpoint, voice-recorder, and voice-lifecycle tests: 21 passed.
- Full `npm test`: 65 passed, 2 failed in existing Arduino firmware assertions (pin 40 versus expected 41, and missing `motorPowerPercent`). Firmware and mapping were left unchanged; these failures require a separate hardware-scoped review.
- Local development HTTP checks: `/guest`, `/control`, and `/display` returned 200. Both service status endpoints returned 200 and `available: true`; Ollama also reported `modelAvailable: true`.
- Cloudflared was not installed on the verification Mac. HTTPS tunnel access and physical iPhone microphone → transcription → AI response remain manual verification steps. Local health checks establish reachability, not end-to-end voice success.

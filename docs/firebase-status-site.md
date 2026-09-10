# Permanent Angklobot status page

## Purpose

Firebase Hosting serves a small public page that remains reachable when the Angklobot Mac is offline. The free launch script creates a Cloudflare Quick Tunnel, writes its current random address into the status page, and redeploys that small page to the same permanent Firebase URL.

- **Online**: Next.js, whisper.cpp, Ollama, and the configured Ollama model are ready.
- **Online with issues**: Next.js is reachable, but Whisper, Ollama, or the model is unavailable.
- **Offline**: the current Quick Tunnel or Next.js cannot be reached before the six-second timeout.

The Firebase page does not capture audio or run AI. **Open Angklobot** navigates to `/guest` on the Mac hostname, where the existing same-origin voice flow remains unchanged.

## Files

- `frontend/status-site/`: standalone static Firebase page.
- `frontend/status-site/runtime-config.example.js`: documented generated-config shape.
- `frontend/firebase.status.json`: isolated Firebase Hosting configuration.
- `frontend/scripts/start-free-mobile-tunnel.sh`: validates localhost, starts the free tunnel, generates `runtime-config.js`, deploys the address, and remains attached to the tunnel.
- `frontend/src/app/api/system/status/route.ts`: combined public health response with no private URLs.

The original `frontend/firebase.json` and existing `angklobot-control-panel.web.app` deployment are not changed by this setup.

## Local preview

Copy `runtime-config.example.js` to the ignored `runtime-config.js` and set `backendOrigin` to `http://localhost:3000`. With Next.js running on port 3000, serve the static status page from another terminal:

```bash
cd frontend/status-site
python3 -m http.server 4173
```

Open `http://localhost:4173`. The generated `runtime-config.js` is ignored by Git.

## Why the tunnel address changes

Cloudflare Quick Tunnels generate a random `trycloudflare.com` address each time. They require neither a paid domain nor a Cloudflare account. The Firebase URL stays permanent; the launch script republishes the new tunnel address whenever Angklobot starts.

When the tunnel stops, Firebase retains the last address, but its health request fails and the page displays Offline. The next launch updates the address. Quick Tunnels have no uptime guarantee and are appropriate for development and demonstrations, not an unattended production service.

## Create a separate Firebase Hosting site

Choose an unused Firebase site ID. The following commands create and connect a second site under the existing `angklobot-control-panel` Firebase project:

```bash
cd frontend
firebase hosting:sites:create YOUR_STATUS_SITE_ID --project angklobot-control-panel
firebase target:apply hosting status YOUR_STATUS_SITE_ID --project angklobot-control-panel
firebase deploy --only hosting:status --config firebase.status.json --project angklobot-control-panel
```

The resulting address is `https://YOUR_STATUS_SITE_ID.web.app`. Creating the site and deploying it are external changes. Firebase Hosting on the Spark plan requires no payment method and currently includes 10 GB of stored Hosting content and 10 GB/month of Hosting transfer. This design does not use Cloud Functions, Cloud Run, Firebase App Hosting, or paid cloud AI.

## Mac startup sequence

The public page reports Online only while Ollama, Whisper, Next.js, and the Quick Tunnel remain running. Start the three local services first:

```bash
ollama serve
scripts/start_voice_macos.sh
cd frontend && npm run build && npm start
```

Then run the free tunnel publisher from another terminal:

```bash
cd frontend
scripts/start-free-mobile-tunnel.sh
```

The script verifies `/api/system/status`, starts cloudflared, validates its generated HTTPS address, writes the ignored runtime configuration, deploys only the separate Firebase status target, and prints both URLs. Leave it running. Ctrl+C stops the tunnel, after which the permanent Firebase page displays Offline.

Use `npm start` for the persistent service rather than exposing the Next.js development server. Automatic startup can later be configured after the manual sequence is stable.

# Public Angklobot song library

Firebase Hosting serves the song library at https://angklobot.web.app. Visitors can search arrangements and listen through their device speakers while the Mac is offline. Open Studio, phone pairing and the legacy interface become available when the Mac website responds. The optional voice services have their own health checks inside the Mac service.

## Files

- `frontend/src/features/studio/PublicLibrary.tsx` uses the same song catalog, scheduler and audio preview as Studio.
- `frontend/status-site/` contains the public page, styles and Mac connection controls.
- `frontend/scripts/build-public-library.mjs` bundles the player and copies the current catalog and arrangements from `frontend/public/songs/` into `frontend/out-status/`.
- `frontend/firebase.status.json` rebuilds that directory before deploying the public Hosting target.
- `frontend/scripts/start-free-mobile-tunnel.sh` publishes the current tunnel address. The phone QR link at `/#pair` opens Devices when Studio is reachable.

## Local preview

Run these commands from the Studio repository with the frontend dependencies installed. To test the connected state, set `backendOrigin` in the local `frontend/status-site/runtime-config.js` before building.

```bash
cd frontend
npm run build:public
python3 -m http.server 4173 --directory out-status
```

Open http://localhost:4173.

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

On the Mac, run `Launch Angklobot Studio.command` from the Studio repository. It starts the local player and publishes the tunnel address to the public website. Leave the launcher running for phone control. The Firebase library and audio previews remain available when the launcher closes.

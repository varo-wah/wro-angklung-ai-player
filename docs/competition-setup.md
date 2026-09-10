# Competition runbook — 10 September 2026

## One shared setup

Use this repository's **main** branch, at the same workspace used for song editing. The integration includes the current song catalog, genre menu, note/rest tuning, USB controls, buffered ESP32 transport, Mac controller/pairing, guest conversation, local voice/wake interaction and display screen. Private Wi-Fi settings remain local and ignored by Git.

The competition address is **http://localhost:3002/control**. Ports 3000/3001 are older development instances, not the canonical competition server. Do not run several competing controller tabs. A branch name alone is not a runtime: the command and the checkout serving that port determine the actual version.

## Start and operate

1. Power the Mac, Mega and ESP32 using the established setup. Keep the physical stop available. Join the Mac and ESP32 to the same tested hotspot/LAN.
2. In this repository, run:
   ```sh
   cd frontend
   npm run competition
   ```
   This builds the production app in its own `.next-competition` directory, then starts it on **127.0.0.1:3002** with both transport choices enabled. First-time clones need `npm ci` beforehand. Reuse an unchanged successful build with `npm run start:competition`.
3. Open `http://localhost:3002/control` in the Codex browser. For USB, use a browser with Web Serial support; this Mac's Codex browser has previously exposed the USB picker. Chrome/Edge are alternatives if Web Serial is unavailable.
4. Click **Enable Mac controller**. Keep that tab open: its session displays the six-digit pairing code. If another tab owns the controller, release it there first. A reload/restart can require re-enabling and pairing again.
5. Select **ESP32 Wi-Fi**, then **Connect ESP32**. Connection checks HELLO, buffered-schedule capability and disarmed Mega STATUS. For USB fallback, stop playback, change to **Arduino USB**, click **Connect Arduino**, and select the Mega. Switching transport stops and disconnects the old connection.
6. Choose a song and **Melody only** or **Melody with Extra**. Press **Generate**, inspect validation, then press **Play**. The current software does not auto-start on connection. Test a short familiar passage and website Stop before the demonstration.
7. **Stop/E-stop:** use the visible website controls; if the website/network is unresponsive, use the physical stop. Do not assume receipt of a remote stop merely because the button was pressed.
8. `/guest`, `/voice`, and `/display` use the same server. Additional tabs can pair with the Mac code. The competition command intentionally binds only to loopback: a phone cannot reach it directly through the Mac's LAN IP. Remote phone/tunnel operation is a separately configured mode in the operating guide, not an automatic property of this startup command.

Do not build into a cache currently used by another Next.js process. Competition and wireless development caches are separate. Stop the running competition terminal with Ctrl-C before rebuilding/restarting on the same port.

## Voice

Song selection/playback works without AI services. For local speech/conversation, start Ollama with the existing `llama3.2:latest` model and the local Whisper service (`scripts/start_voice_macos.sh`), using the [voice setup](wakeword-macos.md). Do not start duplicate processes on ports 11434/8080. Allow the microphone and enable wake listening explicitly. The native openWakeWord research scripts are not the active wake path.

The physical wake sweep is **USB-only**; buffered ESP32 transport does not support it. Use manual Mic for voice while ESP32 is selected. Do not treat that limitation as an ESP32 song-playback failure.

## ESP32 configuration and playback

The local website reads `ANGKLOBOT_BRIDGE_HOST` (default `172.20.10.3`). If DHCP changes the ESP32 IP, start with:

```sh
ANGKLOBOT_BRIDGE_HOST=192.168.1.10 npm run start:competition
```

Use the actual private address; the example is not a discovery result. The token is read server-side from the ignored `firmware/esp32/angklobot_bridge/bridge_config.h`, or `ANGKLOBOT_BRIDGE_TOKEN`. Never put it in `NEXT_PUBLIC_*`, a public URL, Git, or the browser console. Do not expose the ESP32 HTTP endpoint to the Internet.

The full schedule is uploaded before ARM: up to 4096 notes in batches of 32. ESP32 uses its own timing rather than one Wi-Fi round-trip per note. RUN provides a 500ms start delay; a start acknowledgment slower than 400ms cancels playback. Website keepalives run around every 400ms. The bridge cancels on loss of keepalives, late note delivery, or communication errors instead of replaying overdue notes. Stop cancels the buffer and disarms. Pause/resume uploads the remaining schedule again.

## Software and physical status

- **Operator-confirmed on 2026-09-10:** ESP32 Wi-Fi song playback works; a physical stop button is available. Website E-stop remains part of the requested operating setup.
- **Software checked during consolidation:** 141 frontend tests, 51 Python tests (2 optional tests skipped), five wireless Python client tests, three USB/dual-transport/ESP32 native host executables, production Next.js build, and Mega/ESP32 Arduino CLI compilation; buffered upload order, cancellation, completion, deadline handling, lease expiry and local-route protection.
- **Hold/rest policy:** every built-in schedule has a two-second maximum after tempo scaling. USB output and buffered ESP32 upload also cap older/imported holds. Source note-off/rests are retained, with release gaps up to 120ms (35% of the interval for very fast passages). Extra notes stay at most 180ms. Re-generate after changing song/timing settings.
- **Not independently verified by this integration:** the exact binaries currently flashed on both boards, full-rack powered failure testing, measured motor loudness, physical stop wiring, or room/microphone performance.
- **Known wiring discrepancy:** current Mega arrays assign pin 42 to both channel 14 IN2 and channel 17 IN1. These arrays and calibration were preserved because they are the current working source. Reconcile against actual wiring/calibration before certifying the entire rack; successful playback on other channels does not resolve it.
- **Firmware upload targets:** `hardware/arduino/mega_full_18_note_web_serial/mega_full_18_note_web_serial.ino` and `firmware/esp32/angklobot_bridge/angklobot_bridge.ino`. Do not upload the historical parser-only Mega sketch in `firmware/arduino-mega`.

## Recovery and version control

- Failed connection: inspect the real ESP32 IP, hotspot, private token configuration and USB/UART state. No automatic NOTE retry after an ambiguous timeout.
- Controller offline: return to the original Mac tab, enable it again, reconnect the selected transport and re-pair other tabs. Keep the Mac awake.
- Stale song: Generate reloads the selected arrangement and applies the current scheduler. Do not edit a different checkout or use an old port.
- Baseline before this consolidation: `archive/main-before-competition-2026-09-10`.
- All pre-merge local feature work: `archive/working-before-competition-2026-09-10` (commit `32cf427`). This snapshot contains the songs/USB/ESP32/pairing work and excludes ignored credentials.
- Both prior histories are retained by the integration merge. Future edits from this workspace can use a `codex/` feature branch and a tested PR back into `main`; avoid parallel tasks editing the same checkout unnoticed.

See [current song list](song-list.md). Firmware/source consolidation is separate from uploading a board image; this integration performs no firmware upload or powered movement test.

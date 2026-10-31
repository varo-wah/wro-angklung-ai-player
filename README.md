# Angklobot — competition setup

The shared setup is on `main`. Use this repository for song fixes, the operator website, local voice, paired-device control, Arduino USB, and ESP32 Wi-Fi. The active rack is **18 natural notes, G3–C6**.

## Studio v2 preview

The combined application workspace is at **http://127.0.0.1:3011/studio**. Player/UI and camera-conducting work are now integrated in this checkout, at `wro-angklung-ai-player/.worktrees/angklobot-conducting`. Use this directory for further Studio changes; the older hidden `angklobot-app-v2` checkout is a preserved earlier version, not the running source.

```sh
cd frontend
npm ci
npm run dev:studio
```

Studio includes the searchable library, queue/shuffle/repeat player, light/dark themes, saved interface sizing, a resizable queue, and the Conduct camera prototype. Conduct uses the same appearance preferences and shared audio runtime; entering it stops song playback. The `/control` console remains available for hardware operation. Studio does not connect to a robot or start local AI/speech services.

The existing `npm run dev:conduct` command and port 3012 still serve this same source for compatibility with the other chat's preview address. The two ports are separate browser sessions, so their queues and preferences are not live-synchronized. A future edit made in another worktree still needs an explicit integration; chats do not automatically merge code.

See [the architecture and release path](docs/app-v2-architecture.md) for platform boundaries and the next steps toward native packaging and a customer pilot. This is a local preview, not a native package or published commercial release.

## Start the competition website

```sh
cd frontend
npm ci                         # Once after cloning or dependency changes
npm run competition
```

Open **http://localhost:3002/control** in the Codex browser. This builds and runs the production application with USB and ESP32 support on one stable port. Leave the terminal and operator tab open. To restart an unchanged build, use `npm run start:competition`.

Choose **ESP32 Wi-Fi → Connect ESP32**, or **Arduino USB → Connect Arduino**. Enable Mac controller to display the pairing code. Generating a song never starts the motors; press Play explicitly. Keep the physical stop available.

- [Competition runbook and verification status](docs/competition-setup.md)
- [Current song list](docs/song-list.md)
- [USB and paired-device control](docs/operating-configuration.md)
- [Buffered ESP32 website playback](docs/website-wireless-control.md)
- [Authoritative firmware, wiring and private configuration](docs/esp32-wireless-phase1.md)
- [Local Whisper / wake-word setup](docs/wakeword-macos.md)
- [Showcase song arrangement notes](docs/showcase-arrangements.md)

All scheduled holds are capped at two seconds; source rests and release gaps are preserved. Melody only excludes accompaniment, while Melody with Extra uses short support pulses. Curated songs retain section dynamics. The old out-of-range Perfect arrangement is inactive.

Wi-Fi credentials stay in the ignored `firmware/esp32/angklobot_bridge/bridge_config.h` (or server environment). They are not in Git. The competition server binds to loopback; do not expose the ESP32 HTTP endpoint publicly.

ESP32 full-song playback is operator-confirmed working. Code/build checks and a connection badge do not establish the installed firmware revision, motor calibration, or powered failure behavior. A duplicate pin-42 assignment is documented in the runbook and requires physical reconciliation.

Unsupported songs are rejected; arbitrary YouTube-to-song conversion is not implemented. Older parser-only sketches and research prototypes remain for reference, not as the upload target. [Historical overview](docs/legacy-project-overview.md).

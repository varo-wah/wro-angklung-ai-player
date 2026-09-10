# Angklobot — competition setup

The shared setup is on `main`. Use this repository for song fixes, the operator website, local voice, paired-device control, Arduino USB, and ESP32 Wi-Fi. The active rack is **18 natural notes, G3–C6**.

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

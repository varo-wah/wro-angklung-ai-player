# ESP32 USB control

## What changed

The bridge previously used USB `Serial` only for diagnostics and received commands over authenticated HTTP. It now accepts framed USB requests at 115200 baud and returns the Mega's actual responses. The website offers Arduino USB, ESP32 USB, and ESP32 Wi-Fi. Both ESP32 transports use the existing preloaded timestamp scheduler; USB does not stream browser-timed NOTE calls during playback.

USB format: `USB,<request-id>,<command>\n`; response: `USB,<request-id>,<status-code>,<Mega-or-bridge-response>\n`. Request IDs prevent cancelled transactions or diagnostic text from resolving another command. Diagnostics are prefixed `DBG,` and suppressed during USB ownership and while replies drain. Responses drain in bounded, nonblocking chunks.

A successful HELLO claims one transport. Other-transport commands are rejected, except STOP/ALL_OFF/DISARM/ESTOP, which remain available to stop the rack and revoke the old session. STOP preempts ordinary UART transactions immediately; it does not wait for their ACK. The scheduler buffer is cleared. Late ACKs are drained before the safety ACK. Recovery after faults/preemption retains the existing 6.5-second gate.

USB Disconnect sends ESTOP, waits for ACK, releases ownership, and closes the port. Native CDC disconnect detection disarms at the next loop. USB-to-UART adapters cannot report cable loss this way: active schedules expire without keepalive after 2 seconds; the general owner lease is 7 seconds. Existing pulse limits and Mega watchdog remain in effect. Keep the browser active while playing. Wi-Fi loss revokes Wi-Fi ownership; it does not stop a USB-owned schedule. To switch from Wi-Fi to USB, disconnect Wi-Fi first; if ownership is still held, allow up to 14 seconds for lease/recovery and reconnect.

## Board verification status

On this Mac, Arduino CLI detected only Arduino Mega VID 2341 / PID 0042 at `/dev/cu.usbmodem11401`. No ESP32 was enumerated. Consequently the actual ESP32 model, installed USB configuration and physical socket cannot yet be confirmed. Do not select the Mega port for this upload.

Local Arduino ESP32 core 3.3.11 defines these ESP32-S3 configurations:

- Native ESP32-S3 USB socket: USB Mode = Hardware CDC and JTAG; USB CDC On Boot = Enabled. The sketch's `Serial` is native USB CDC. On a two-port board, use its native USB socket, not the socket connected to the USB-UART converter.
- USB-to-UART converter socket: USB CDC On Boot = Disabled. The sketch's `Serial` is UART0 connected to that converter. The Mega UART remains HardwareSerial(2), RX16/TX17 at 115200 in either configuration.

These are conditional settings for an ESP32-S3, not an identification of the connected hardware. Confirm the board/module marking and socket labels, then compare `arduino-cli board list` with the cable unplugged and plugged in. USB-C connector shape alone does not establish which interface is wired.

References: [Espressif DevKitC-1 port guide](https://documentation.espressif.com/api/resource/path/docs/projects/esp-dev-kits/en/latest/esp32s3/esp32-s3-devkitc-1/user_guide.html), [serial port identification](https://docs.espressif.com/projects/esp-idf/en/latest/esp32s3/get-started/establish-serial-connection.html). Other manufacturers may use different labels/layouts.

## Firmware upload

1. Stop playback, disconnect the website transport, and close Serial Monitor. Identify the ESP32 board and newly enumerated port as above.
2. Open `firmware/esp32/angklobot_bridge/angklobot_bridge.ino` in Arduino IDE. Keep the existing ignored `bridge_config.h` and its Wi-Fi/token configuration. No changes to Mega firmware, pin mappings, calibration or UART wires are required.
3. Select the actual board and matching USB settings above. Select the ESP32's port. Upload. If the board does not enter download mode automatically, follow its documented BOOT/RESET procedure, then reset to run after uploading.
4. Re-select the runtime USB port if it re-enumerates. Close Serial Monitor before connecting the website.

Compile-only command used for native ESP32-S3 USB (not a verified physical-board profile):

```sh
"/Applications/Arduino IDE.app/Contents/Resources/app/lib/backend/resources/arduino-cli" compile \
  --fqbn esp32:esp32:esp32s3:USBMode=hwcdc,CDCOnBoot=cdc \
  --build-path /tmp/angklobot-esp32-usb-build firmware/esp32/angklobot_bridge
```

For the USB-to-UART configuration, compile with `CDCOnBoot=default`. Actual upload must use the confirmed board profile and ESP32 port; none was uploaded during this change.

## Website connection

1. Open `http://localhost:3002/control` on the Mac in a browser exposing Web Serial. Use the Codex browser if its port chooser is available; otherwise a desktop Web Serial-capable browser is required.
2. Enable the Mac controller and hardware output using the existing controls. Disconnect the currently selected hardware transport.
3. In the connection selector, choose **ESP32 USB**, then **Connect ESP32 USB**. Choose the ESP32 runtime serial port, not Arduino Mega. Allow boot/recovery time; success says **Mega ready, disarmed**.
4. Generate a song and press Play. The existing schedule upload, ARM, synchronized start, STOP and E-stop controls apply. ESP32 USB is independent of the Wi-Fi bridge host address.
5. Phones continue pairing to the Mac through the existing tunnel. They send commands to the Mac; the Mac owns the USB cable and port permission. Select transports on the Mac.

## Verification and physical acceptance

Host firmware tests cover framed requests, mutual exclusion, STOP preemption, stale ACK handling, malformed input, disconnected-Wi-Fi USB scheduling, owner lease and short TX buffers. Browser transport tests cover reply correlation, diagnostic filtering, pending-request disconnect, preloaded USB playback and release. Existing Wi-Fi tests are retained.

Before competition, on the actual rack: confirm disarmed handshake; play a short phrase; STOP during playback/upload; unplug USB during playback; verify Wi-Fi cannot ARM while USB owns the bridge; disconnect and retest Wi-Fi and direct Mega USB. Measure timing and listen to the real output. Compilation and simulated tests do not verify latency, USB enumeration, electrical behavior or motor operation.

## Change index and check results

All paths below are relative to the repository root; line numbers identify the relevant changes.

| File | Line | Change |
| --- | ---: | --- |
| `firmware/esp32/angklobot_bridge/angklobot_bridge.ino` | 22 | Exclusive transport ownership; USB framing at 269, bounded replies and disconnect handling at 304 |
| `frontend/src/lib/esp32UsbLink.ts` | 11 | Web Serial framed command link |
| `frontend/src/lib/esp32Transport.ts` | 49 | USB handshake through the shared scheduler; disconnect/release at 171 |
| `frontend/src/lib/robotTransport.ts` | 3 | Third transport type |
| `frontend/src/components/AngklungSystemProvider.tsx` | 1190 | Transport factory and existing Mac/phone control integration; persisted selection at 402 |
| `frontend/src/components/PlaybackControls.tsx` | 63 | Connection labels and third selector option at 102 |
| `firmware/esp32/angklobot_bridge/tests/Arduino.h` | 33 | Serial write stub for bounded TX checks |
| `firmware/esp32/angklobot_bridge/tests/bridge_test.cpp` | 37 | Wi-Fi owner in the scheduler test fixture |
| `firmware/esp32/angklobot_bridge/tests/usb_test.cpp` | 1 | USB firmware regression harness |
| `frontend/tests/esp32-usb-link.test.cjs` | 1 | USB serial and shared scheduler tests |
| `docs/esp32-usb-control.md` | 1 | Protocol, board uncertainty, upload and connection instructions |

Verification on 2026-09-12: both native C++ harnesses pass; ESP32-S3 native CDC and USB-UART profiles compile with Arduino core 3.3.11; TypeScript and Next.js production build pass. Frontend suite: 159 pass, 2 fail. The same failures reproduce in a clean HEAD archive: `library-balance.test.cjs` arrangement snapshot for You Are the Reason, and `song-flow.test.cjs` ambiguous alias expectation. Neither arrangement data nor alias handling was changed here.

The production build is running at localhost:3002; the new selector was observed in a fresh Codex browser page. The existing tunnel guest endpoint returned HTTP 200 (using a DNS override on this Mac). End-to-end phone pairing was not retested. No firmware upload, physical latency measurement or motor test was performed. After the server restart, enable the Mac controller again in the fresh page before connecting hardware.

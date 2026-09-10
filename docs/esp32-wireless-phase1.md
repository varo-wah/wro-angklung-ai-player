# Phase 1: Mac → Wi-Fi → ESP32-S3 → Mega → one NOTE

Status (2026-09-09 device setup): both boards uploaded; Mac → iPhone hotspot →
ESP32 → Mega UART → `NOTE,0,300,1000` acknowledged with motor power confirmed
physically disconnected. Final ALL_OFF/DISARM acknowledgments and STATUS verified
ARMED=FALSE, CONTINUOUS=FALSE, ROUTINE=NONE. A subsequent powered single-note command sequence also completed with every acknowledgment; physical motion/stopping awaits operator confirmation.
One initial ALL_OFF HTTP request exceeded the client's old two-second timeout;
DISARM succeeded, followed by explicit ALL_OFF/DISARM/STATUS verification without
another NOTE. Client timeout is now five seconds; Mega pulse caps and lease remain
unchanged. No full-song wireless playback is implemented.

## Firmware authority and wiring

Upload `hardware/arduino/mega_full_18_note_web_serial/mega_full_18_note_web_serial.ino`
to the Mega. Its existing motor implementation, calibration, pulse limits and pin
arrays are preserved. Do **not** upload the historical parser-only
`firmware/arduino-mega/angklobot_mega/angklobot_mega.ino`: its NOTE field order and
1–18 IDs are incompatible with the current motor protocol.

The existing ESP32 UART test at
`firmware/esp32/angklobot_bridge/angklobot_bridge.ino` specified RX GPIO16,
TX GPIO17, UART2, 115200 baud. This integration retains those values, 8N1,
without flow control. Its former automatic boot NOTE has been removed.
The old sketch warned that these pin choices required board confirmation: the
repository does not prove it is the exact binary used in the successful test.
Compare these values with that physical setup before uploading. If they differ,
stop and record the confirmed test pins rather than guessing replacements.

| Signal | ESP32-S3 | Mega 2560 |
|---|---|---|
| ESP32 → Mega | GPIO17 TX | pin 19 RX1 |
| Mega → ESP32 | GPIO16 RX, through suitable 5 V → 3.3 V level conversion | pin 18 TX1 |
| Reference | GND | GND |

Retain the already-tested UART wiring and voltage conversion. Exact installed
level-shifter/divider components and ESP32-S3 board variant are **unverified**.
Do not connect a 5 V Mega TX output directly to a 3.3 V ESP32 input. Verify the
3.3 V ESP32 TX → Mega RX path meets the installed hardware's input requirements.
Use the boards' normal USB supplies; do not power motors from ESP32 or USB rails.
Keep the motor supply disconnected during uploads and the first test.

References: [Arduino Mega pin specification](https://store-usa.arduino.cc/products/arduino-mega-2560-rev3),
[ESP32-S3 datasheet](https://documentation.espressif.com/esp32_s3_datasheet_en.pdf).

Authoritative arrays, channels 0–17, copied unchanged:

```text
IN1: 6,8,2,4,28,26,32,30,12,10,24,22,36,34,41,38,44,42
IN2: 7,9,3,5,29,27,33,31,14,11,25,23,37,35,42,39,45,43
Power %: 30,28,30,30,30,30,25,30,25,30,30,25,25,25,55,35,22,25
Default calibration pulses: 550 ms on every channel
```

**Pin 42 remains shared by channel 14 IN2 and channel 17 IN1.** The old Mega
comment/startup banner says G5=40/41, but its actual arrays say 41/42. This
integration deliberately does not resolve that discrepancy. Do not use this
phase to validate the upper rack. The requested channel 0 uses pins 6/7 (G3).
Strength 1000 means full *calibrated* power: channel 0 duty is 30%, not raw 100%.

## Configure and upload

Run shell commands from the repository root. Close the Chrome serial connection
and any serial monitor before uploading. Record/copy your known-working firmware
and calibration before replacing a board image. Existing uncommitted repository
work is not a reproducible rollback image unless you preserve it separately.

1. Copy the configuration template:

   ```sh
   cp firmware/esp32/angklobot_bridge/bridge_config.example.h firmware/esp32/angklobot_bridge/bridge_config.h
   python3 -c 'import secrets; print(secrets.token_hex(32))'
   ```

   Edit the ignored `bridge_config.h`: set local Wi-Fi SSID/password and put the
   generated random token in `BRIDGE_TOKEN`. The current device setup has an
   ignored private configuration entered through local prompts; preserve it. Placeholder/short tokens disable Wi-Fi startup.
   Use a trusted 2.4 GHz LAN shared with the Mac. Never commit this file.

2. In Arduino IDE, select **Arduino Mega or Mega 2560**, processor ATmega2560,
   and its actual USB port. Open and upload the authoritative full-rack sketch
   above. Uploading resets the Mega; it starts disarmed.

3. Select the exact ESP32-S3 board/USB settings for your hardware, open
   `firmware/esp32/angklobot_bridge/angklobot_bridge.ino`, and upload to its port.
   A generic **ESP32S3 Dev Module** compile was verified; that does not establish
   the correct flash/PSRAM/USB settings for your board. Use its BOOT/RESET upload
   procedure if required. Do not upload the historical UART parser to the Mega.

4. Open the ESP32 USB monitor at 115200. On connection it prints
   `Bridge IP: 192.168.…`. The address is also available in the router's DHCP
   leases. The correct USB console/CDC setting depends on the board.
   Wait at least 6.5 seconds after ESP32 startup or a bridge fault before HELLO.

Optional CLI equivalents, with actual ports chosen from `arduino-cli board list`:

```sh
arduino-cli compile --fqbn arduino:avr:mega hardware/arduino/mega_full_18_note_web_serial
arduino-cli upload --fqbn arduino:avr:mega --port '<MEGA_USB_PORT>' hardware/arduino/mega_full_18_note_web_serial
arduino-cli compile --fqbn esp32:esp32:esp32s3 firmware/esp32/angklobot_bridge
arduino-cli upload --fqbn esp32:esp32:esp32s3 --port '<ESP32_USB_PORT>' firmware/esp32/angklobot_bridge
```

The installed CLI is also available at
`/Applications/Arduino IDE.app/Contents/Resources/app/lib/backend/resources/arduino-cli`.
Both boards were uploaded during device setup. ESP32 upload used
`esp32:esp32:esp32s3:CDCOnBoot=cdc,USBMode=hwcdc,FlashSize=16M`, matching its
identified native USB-Serial/JTAG interface and 16 MB quad flash. PSRAM is unused.

## Run the two-stage single-note test

First physically disconnect motor power. Set the token in the Mac environment
without placing it in a command-line argument or committing it. In macOS zsh:

```sh
read -rs 'ANGKLOBOT_BRIDGE_TOKEN?Bridge token: '
export ANGKLOBOT_BRIDGE_TOKEN
python3 scripts/wireless/single_note.py --host 192.168.1.123 --stage power-disconnected
```

Replace `192.168.1.123` with the printed ESP32 IP. The script only accepts RFC1918
private IPv4 addresses and does not follow HTTP redirects. The stage is an
operator declaration; it cannot detect whether motor power is actually removed.

After the powerless test succeeds, inspect the outputs/wiring, explicitly enable
motor power yourself, keep a physical power cut available, and invoke:

```sh
python3 scripts/wireless/single_note.py --host 192.168.1.123 --stage powered
```

Expected protocol, in order (HTTP 200 with these actual Mega response bodies):

| Command | Expected response |
|---|---|
| `HELLO,1` | `READY,1,ACTIVE` |
| `STATUS` | `STATUS,READY,PROTOCOL=1,MODE=NORMAL,ARMED=FALSE,CONTINUOUS=FALSE,ROUTINE=NONE` |
| `ARM` | `ACK,ARM` |
| `NOTE,0,300,1000` | `ACK,NOTE,0` |
| `ALL_OFF` | `ACK,ALL_OFF` |
| `DISARM` | `ACK,DISARM` |

The script waits 350 ms after NOTE acknowledgment, then sends both cleanup commands.
It checks every acknowledgment, aborts if STATUS is already armed, never retries
ARM/NOTE, and attempts both cleanup commands independently after an ARM attempt,
even if a response is lost. ACK proves parsing/acceptance, not physical movement.
Also supported: `PING` → `PONG`, `STOP` → `ACK,ALL_OFF`, `ESTOP` → `ACK,DISARM`.
ESTOP retains the established protocol semantics; it is not a latched hardware
emergency stop and a later explicit ARM can re-enable output.

## Bridge API, ownership, and fail-safe behavior

- HTTP port 80, `POST /command`, `Authorization: Bearer <token>`, a Content-Length
  body containing exactly one ASCII command with an optional final CRLF/newline.
  No batches, CORS support, song queue, calibration commands, sweeps, or ALLON.
  NOTE retains channels 0–17, duration 1–5000 ms and strength 0–1000; Mega performs
  the authoritative numeric validation and returns its real errors.
- Authenticated `GET /health` reports Wi-Fi IP, recent Mega response evidence
  (fresh for five seconds), and whether recovery requires HELLO. It does not
  falsely label an unprobed or stale UART as connected; use PING/STATUS to probe.
- Four bounded HTTP slots, at most 1024 request bytes each, 95 body bytes,
  one-second HTTP assembly timeout, 192-byte UART response buffer, and 750 ms
  UART acknowledgment timeout. There is one UART transaction and **zero queued
  ordinary commands**. Excess ordinary requests receive HTTP 409 BUSY.
- STOP/ALL_OFF/DISARM/ESTOP preempt a pending ordinary transaction. Its caller
  receives 409 PREEMPTED; the bridge drains that transaction's reply before
  returning the real stop ACK. If either response is missing, timeout recovery
  applies. Safety commands are still allowed during recovery. A stop already
  pending is not replaced. Socket saturation can delay accepting a new request
  until a bounded slot expires; Wi-Fi is not a hard real-time emergency stop.
- Mega ARM claims USB or UART ownership. The other transport can inspect status
  but cannot activate or change calibration. Its control attempt gets
  `ERROR,CONTROLLER_BUSY`. Either transport may stop outputs. A stop from the
  other transport additionally disarms/revokes ownership; same-owner ALL_OFF
  keeps ARM, matching USB behavior. DISARM/ESTOP release ownership.
- UART cannot enter continuous or calibration modes. Existing USB calibration
  behavior remains available when USB owns the Mega; USB ALLON still requires
  explicit stop, exactly as before. Do not use continuous USB tests for this phase.
- Mega wireless ownership expires after 6000 ms without a non-read-only wireless
  control command; it stops all outputs and disarms. PING/STATUS/HELLO do not
  extend the lease. Timed NOTE pulses independently expire within their requested
  duration (maximum 5000 ms), even if the ESP32 dies or UART disconnects.
- On Wi-Fi loss, a pending-client loss, or UART timeout, the ESP32 sends DISARM
  if ARM might have been sent, drops the transaction, and requires 6500 ms plus
  a successful HELLO before ordinary control resumes. No automatic ARM/NOTE on
  startup/reconnect. HTTP connections normally close after each response; that
  is not a fault. A Mac disappearing between requests is covered by pulse expiry
  and the Mega lease, without relying on ESP32 heartbeat traffic.
- Keep this on a trusted local LAN: **no port forwarding, Quick Tunnel,
  cloudflared, public reverse proxy, or public deployment**. Bearer authentication
  is required on both endpoints. HTTP is unencrypted: anyone able to observe
  traffic on that network can obtain the token. Use an isolated trusted LAN and
  rotate the token if disclosed. No cloud AI or frontend transport changes.

## Troubleshooting

- No IP: check 2.4 GHz SSID/password, AP reachability, board USB console setting,
  and token length; the bridge does not start Wi-Fi with a short token.
- HTTP 401: token must match exactly. HTTP 503: wait 6.5 seconds, then HELLO;
  restarting the script performs that handshake but does not automatically wait.
- HTTP 504 or no READY: verify crossed TX/RX, shared ground, level conversion,
  GPIO16/17, 115200 8N1, and that the *full-rack* Mega sketch was uploaded.
  Old parser-only firmware cannot produce READY/ARM acknowledgments.
- CONTROLLER_BUSY or STATUS already armed: finish/disarm the active controller,
  close Chrome's control session, then restart this test. Avoid opening Mega USB
  serial during a wireless test: board reset behavior may interrupt it.
- 409 PREEMPTED: the ordinary command was cancelled by a stop. Wait for recovery
  and restart explicitly. Never auto-retry a NOTE with an ambiguous response.
- ACK but no motion: first-stage power is intentionally disconnected; after
  explicit power enable inspect channel 0, supply, driver, and calibration.
  Do not remap the rack or increase power to compensate without diagnosis.
- If cleanup cannot be confirmed, remove motor power. A powered acceptance test
  should also check pulse expiry, Wi-Fi removal, and UART removal under operator
  supervision. These physical failure tests have not been performed.

## Verification performed

```sh
sh scripts/wireless/test-host.sh
node --test frontend/tests/arduino-full-rack.test.cjs
```

Three native C++ test executables passed (existing USB protocol, dual-transport
Mega safety, ESP32 bridge behavior), plus five Python client tests and ten
frontend serial compatibility tests. The host shims exercise firmware logic,
not electrical behavior or actual ESP32 TCP/UART scheduling. Stale calibration
expectations in the USB and frontend tests were aligned with the preserved local
firmware; the calibration values themselves were not changed.

Arduino CLI builds passed with `arduino:avr` 1.8.8 / `arduino:avr:mega` and
`esp32:esp32` 3.3.11 / `esp32:esp32:esp32s3`. Initial ESP32 compilation used a temporary
copy with dummy credentials. Device setup subsequently installed the private
iPhone hotspot configuration; credentials are not included in this document.
Pin arrays, calibration arrays, and the motor-control function block were checked
exactly against the working file captured before this task. Software remains local and uncommitted; nothing was pushed. Before Mega upload,
USB CALEXPORT confirmed all current pin/calibration values, including newer
channel 3/14/15/16 power edits already present on the board and in local source.
Test expectations were updated to those physically reported values; motor code
and calibration were not edited during device setup.

The previous Mega flash was read successfully to the ignored local backup
`outputs/firmware-backups/phase1/mega-before-wireless.hex` (262144 bytes).
ESP32 old-image backup attempts failed and no verified ESP32 rollback image exists.
Upload logs are in that same ignored directory. ESP32 firmware flash verification
passed; Mega Arduino CLI upload completed successfully.

Current acceptance boundary: Wi-Fi/UART single NOTE accepted with motor power
removed; physical motor movement and powered failure testing remain pending.
After the operator corrected the wires, the first UART HELLO returned an error;
a fresh complete HELLO then returned READY. No GPIO routing was changed.
USB diagnostics repeat Wi-Fi status/IP and print UART TX/RX plus HTTP result codes
without credentials. They now drop output when the USB transmit buffer is full,
with native USB transmit waits disabled, so an unopened monitor cannot stall the
bridge. Host bridge tests also run with zero USB transmit capacity.

Observed command sequence: READY → disarmed STATUS → ACK,ARM → ACK,NOTE,0 →
ALL_OFF HTTP timeout → ACK,DISARM. Follow-up, with no repeated NOTE:
ACK,ALL_OFF (1.7 seconds), ACK,DISARM, disarmed/no-continuous/no-routine STATUS.
The client now permits five seconds for network transport, independently of the
750 ms ESP32 UART deadline and the Mega's own safety limits.


## Powered command test

After the operator explicitly enabled motor power, one `NOTE,0,300,1000` was sent
through the hotspot bridge. HELLO, STATUS, ARM, NOTE, ALL_OFF and DISARM all
returned their expected acknowledgments without retries. A final STATUS reported
ARMED=FALSE, CONTINUOUS=FALSE, ROUTINE=NONE. No second NOTE was sent. Actual G3
movement and stopping still require the operator's visual confirmation.

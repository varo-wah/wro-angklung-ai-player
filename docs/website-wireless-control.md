# Website USB / ESP32 selection

From `frontend/`, run `npm run dev:wireless`, then open
`http://localhost:3002/control` on the Mac. Keep the Mac and ESP32 on the
same local Wi-Fi network. This server binds only to the Mac's loopback address;
do not publish or tunnel it.

Choose **Robot connection → ESP32 Wi-Fi**, then **Connect ESP32**. The existing
playback controls use that connection. Choose **Arduino USB** to return to Web
Serial in desktop Chrome. Switching transports stops playback and disconnects
the old transport. The choice is remembered, but reconnecting and playing remain
explicit actions.

The local server defaults to ESP32 address `172.20.10.3`. If its address changes,
start the server with `ANGKLOBOT_BRIDGE_HOST=<private-ip> npm run dev:wireless`.
Authentication is read server-side from the ignored
`firmware/esp32/angklobot_bridge/bridge_config.h`, or from
`ANGKLOBOT_BRIDGE_TOKEN`. Never put the token in a `NEXT_PUBLIC_` variable.

The website checks real HELLO and STATUS responses before connecting and sends
ARM only when starting playback. Stop cancels pending notes and sends ESTOP.
Notes are serialized, with at most eight pending and a 200 ms queue-age limit;
timeouts or overload stop playback instead of replaying delayed notes. The Mega's
existing pulse caps and wireless lease remain the hardware-side limits.

This integration has only received a TypeScript check. Full-song wireless timing
and physical playback have not been tested. Dense arrangements may stop on the
queue limit; use USB for those arrangements. The ESP32 bridge does not support
the wake sweep. No firmware, calibration, or arrangement changes are required by
this website integration.

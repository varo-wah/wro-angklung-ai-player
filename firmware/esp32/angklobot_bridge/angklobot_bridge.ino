#include <Arduino.h>
#include <WiFi.h>
#include "bridge_config.h"

// Pins and baud retained from the repository's UART PING/PONG test.
constexpr int ESP32_UART_RX_PIN = 16;
constexpr int ESP32_UART_TX_PIN = 17;
constexpr unsigned long MEGA_UART_BAUD = 115200;
constexpr unsigned long UART_TIMEOUT_MS = 750;
constexpr unsigned long RECOVERY_MS = 6500; // Longer than Mega's wireless lease.
constexpr size_t CLIENT_COUNT = 4;
constexpr size_t MAX_HTTP_BYTES = 4096;
HardwareSerial megaUart(2);
WiFiServer server(80);
struct HttpSlot {
  WiFiClient socket;
  String request;
  unsigned long started = 0;
  bool waiting = false;
};
HttpSlot clients[CLIENT_COUNT];
int pending = -1;
uint8_t skippedReplies = 0;
String pendingCommand;
unsigned long sentAt = 0, recoveryAt = 0, lastReplyAt = 0;
bool fault = true, seenReply = false, wirelessMayBeArmed = false, wasConnected = false;
char response[192];
size_t responseLength = 0;
bool discardResponse = false;

// Bounded, preloaded schedule. No network transaction is needed at a note deadline.
struct ScheduledNote { uint32_t at; uint16_t duration, strength; uint8_t channel; };
constexpr size_t MAX_SCHEDULE_NOTES = 4096;
ScheduledNote notes[MAX_SCHEDULE_NOTES];
size_t noteCount = 0, expectedNotes = 0, nextNote = 0;
uint32_t scheduleId = 0, startsAt = 0, keepAt = 0, lastMotorCommandAt = 0, endsAt = 0;
bool scheduleRunning = false;
void clearSchedule() {
  scheduleRunning = false; scheduleId = 0; noteCount = expectedNotes = nextNote = 0;
}
void tickSchedule();
bool scheduleCommand(int i, const String &command);

// Diagnostic output must never hold up network/UART safety handling.
void logLine(const String &line) {
  if (Serial && Serial.availableForWrite() >= (int)line.length() + 2)
    Serial.println(line);
}

bool safetyCommand(const String &s) {
  return s == "STOP" || s == "ALL_OFF" || s == "DISARM" || s == "ESTOP";
}
bool allowedCommand(const String &s) {
  return safetyCommand(s) || s == "HELLO,1" || s == "PING" ||
    s == "STATUS" || s == "ARM" || s.startsWith("NOTE,");
}
void finish(int i, int code, const String &body) {
  if (i < 0) return;
  logLine("HTTP result: " + String(code));
  auto &c = clients[i];
  c.socket.printf("HTTP/1.1 %d Result\r\nContent-Type: text/plain\r\nContent-Length: %u\r\nConnection: close\r\nCache-Control: no-store\r\n\r\n",
    code, (unsigned)(body.length() + 1));
  c.socket.print(body); c.socket.print('\n');
  c.socket.stop(); c.request = ""; c.waiting = false;
}
void failSafe(const char *reason) {
  clearSchedule();
  if (wirelessMayBeArmed) megaUart.println("DISARM");
  wirelessMayBeArmed = false;
  fault = true; recoveryAt = millis(); seenReply = false;
  if (pending >= 0) finish(pending, 504, reason);
  pending = -1; pendingCommand = "";
}
bool matchesReply(const String &line) {
  if (line.startsWith("ERROR,")) return true;
  if (pendingCommand == "HELLO,1") return line == "READY,1,ACTIVE";
  if (pendingCommand == "PING") return line == "PONG";
  if (pendingCommand == "STATUS") return line.startsWith("STATUS,READY,PROTOCOL=1,");
  if (pendingCommand == "ARM") return line == "ACK,ARM";
  if (pendingCommand == "DISARM" || pendingCommand == "ESTOP") return line == "ACK,DISARM";
  if (pendingCommand == "STOP" || pendingCommand == "ALL_OFF") return line == "ACK,ALL_OFF";
  return pendingCommand.startsWith("NOTE,") && line == "ACK,NOTE," + pendingCommand.substring(5, pendingCommand.indexOf(',', 5));
}
void readMega() {
  for (int n = 0; n < 256 && megaUart.available(); ++n) {
    char ch = megaUart.read();
    if (ch == '\r') continue;
    if (ch == '\n') {
      if (!discardResponse && responseLength) {
        response[responseLength] = 0;
        String line(response);
        logLine("UART RX: " + line);
        if (skippedReplies) { --skippedReplies; }
        else if (pending != -1 && matchesReply(line)) {
          if (pending == -2 && line.startsWith("ERROR,")) { failSafe("BRIDGE,SCHEDULE_MEGA_ERROR"); responseLength = 0; return; }
          seenReply = true; lastReplyAt = millis();
          if (line == "READY,1,ACTIVE") fault = false;
          if (line == "ACK,DISARM") wirelessMayBeArmed = false;
          finish(pending, 200, line); // Actual Mega line, including validation errors.
          pending = -1; pendingCommand = "";
        }
      }
      responseLength = 0; discardResponse = false;
    } else if (responseLength < sizeof(response) - 1 && !discardResponse) {
      response[responseLength++] = ch;
    } else { discardResponse = true; }
  }
}
void dispatch(int i, String command) {
  const bool safety = safetyCommand(command);
  if (safety) clearSchedule();
  else if (scheduleCommand(i, command)) return;
  else if (scheduleRunning) { finish(i, 409, "BRIDGE,SCHEDULE_ACTIVE"); return; }
  if (!allowedCommand(command)) { finish(i, 400, "BRIDGE,COMMAND_NOT_ALLOWED"); return; }
  if (!safety && fault && (command != "HELLO,1" || millis() - recoveryAt < RECOVERY_MS)) {
    finish(i, 503, "BRIDGE,RECOVERY_REQUIRED_WAIT_6500MS_THEN_HELLO"); return;
  }
  if (pending != -1) {
    if (!safety || safetyCommand(pendingCommand)) { finish(i, 409, "BRIDGE,BUSY"); return; }
    // Cancel ordinary traffic; wait for the safety ACK, never an old NOTE ACK.
    finish(pending, 409, "BRIDGE,PREEMPTED_BY_STOP");
    pending = -1;
    skippedReplies = 1; // Drain the cancelled transaction reply before the stop ACK.
    // Lock out subsequent ARM/NOTE until late replies and the old lease expire.
    fault = true; recoveryAt = millis();
  }
  if (command == "HELLO,1" && fault) {
    skippedReplies = 0; responseLength = 0; discardResponse = false;
  }
  pending = i; pendingCommand = command; sentAt = millis();
  clients[i].waiting = true;
  if (command == "ARM") wirelessMayBeArmed = true;
  logLine("UART TX: " + command);
  megaUart.println(command);
}
bool scheduleCommand(int i, const String &command) {
  if (!command.startsWith("SCHED,")) return false;
  if (command == "SCHED,CAPS") { finish(i, 200, "SCHED,1,4096"); return true; }
  if (fault) { finish(i, 503, "BRIDGE,RECOVERY_REQUIRED"); return true; }
  unsigned id = 0, value = 0; int used = 0;
  if (sscanf(command.c_str(), "SCHED,BEGIN,%u,%u%n", &id, &value, &used) == 2 && used == (int)command.length()) {
    if (scheduleId || wirelessMayBeArmed || pending != -1 || id == 0 || value > MAX_SCHEDULE_NOTES) {
      finish(i, 409, "BRIDGE,SCHEDULE_BUSY_OR_TOO_LARGE"); return true;
    }
    clearSchedule(); scheduleId = id; expectedNotes = value; keepAt = millis(); endsAt = 0;
    finish(i, 200, "SCHED,OK"); return true;
  }
  used = 0;
  if (sscanf(command.c_str(), "SCHED,ADD,%u,%u,%n", &id, &value, &used) == 2 && used > 0) {
    if (!scheduleId || id != scheduleId || scheduleRunning || value != noteCount) { finish(i, 409, "BRIDGE,SCHEDULE_SEQUENCE"); return true; }
    size_t original = noteCount; uint32_t end = endsAt;
    const char *cursor = command.c_str() + used;
    bool valid = *cursor != 0;
    while (valid && *cursor) {
      unsigned at, channel, duration, strength; int consumed = 0;
      if (sscanf(cursor, "%u:%u:%u:%u%n", &at, &channel, &duration, &strength, &consumed) != 4 ||
          noteCount >= expectedNotes || noteCount >= MAX_SCHEDULE_NOTES || at > 1800000 || channel > 17 ||
          duration < 1 || duration > 5000 || strength > 1000 || (noteCount && at < notes[noteCount-1].at)) { valid = false; break; }
      notes[noteCount++] = {at, (uint16_t)duration, (uint16_t)strength, (uint8_t)channel};
      if (at + duration > end) end = at + duration;
      cursor += consumed;
      if (*cursor == ';' && cursor[1]) ++cursor;
      else if (*cursor) valid = false;
    }
    if (!valid) { noteCount = original; finish(i, 400, "BRIDGE,SCHEDULE_INVALID"); }
    else { endsAt = end; keepAt = millis(); finish(i, 200, "SCHED,OK"); }
    return true;
  }
  used = 0;
  if (sscanf(command.c_str(), "SCHED,RUN,%u%n", &id, &used) == 1 && used == (int)command.length()) {
    if (!scheduleId || id != scheduleId || scheduleRunning || noteCount != expectedNotes || !wirelessMayBeArmed || pending != -1) {
      finish(i, 409, "BRIDGE,SCHEDULE_NOT_READY"); return true;
    }
    startsAt = millis() + 500; keepAt = lastMotorCommandAt = millis(); scheduleRunning = true;
    finish(i, 200, "SCHED,STARTING,500"); return true;
  }
  used = 0;
  if (sscanf(command.c_str(), "SCHED,KEEP,%u%n", &id, &used) == 1 && used == (int)command.length()) {
    if (!scheduleId || id != scheduleId) finish(i, 409, "BRIDGE,SCHEDULE_EXPIRED");
    else { keepAt = millis(); finish(i, 200, scheduleRunning ? "SCHED,RUNNING" : "SCHED,READY"); }
    return true;
  }
  finish(i, 400, "BRIDGE,SCHEDULE_INVALID"); return true;
}
void tickSchedule() {
  if (!scheduleId) return;
  if (millis() - keepAt > (scheduleRunning ? 2000u : 15000u)) { failSafe("BRIDGE,SCHEDULE_LEASE_EXPIRED"); return; }
  if (!scheduleRunning || pending != -1 || (int32_t)(millis() - startsAt) < 0) return;
  uint32_t elapsed = millis() - startsAt;
  String command;
  if (nextNote < noteCount && notes[nextNote].at <= elapsed) {
    const auto &note = notes[nextNote++];
    if (elapsed - note.at > 100) { failSafe("BRIDGE,SCHEDULE_LATE"); return; }
    command = "NOTE," + String((int)note.channel) + "," + String((int)note.duration) + "," + String((int)note.strength);
  } else if (nextNote == noteCount && elapsed >= endsAt) {
    scheduleRunning = false; command = "DISARM";
  } else if (millis() - lastMotorCommandAt >= 5500) {
    // All pulses are bounded to <=5000 ms. Renew ownership during long rests
    // only after any preceding pulse has ended; ARM would interrupt motors.
    command = "ALL_OFF";
  } else return;
  pending = -2; pendingCommand = command; sentAt = lastMotorCommandAt = millis();
  megaUart.println(command);
}
void parseRequest(int i) {
  auto &c = clients[i];
  int end = c.request.indexOf("\r\n\r\n");
  if (end < 0) return;
  String headers = c.request.substring(0, end + 2);
  String lower = headers; lower.toLowerCase();
  // One exact bearer header; reject transfer encodings and ambiguous lengths.
  String authActual = headers; // Token is case sensitive.
  int authPos = lower.indexOf("\r\nauthorization: ");
  if (authPos < 0 || authActual.substring(authPos + 17, headers.indexOf("\r\n", authPos + 2)) != "Bearer " + String(BRIDGE_TOKEN)) {
    finish(i, 401, "BRIDGE,UNAUTHORIZED"); return;
  }
  if (lower.indexOf("transfer-encoding:") >= 0) { finish(i, 400, "BRIDGE,INVALID_HTTP"); return; }
  if (headers.startsWith("GET /health HTTP/1.1\r\n")) {
    String health = "WIFI=CONNECTED,IP=" + WiFi.localIP().toString() +
      ",MEGA=" + (seenReply && millis() - lastReplyAt < 5000 ? String("RECENT_RESPONSE") : String("UNKNOWN_OR_STALE")) +
      ",RECOVERY_REQUIRED=" + (fault ? String("TRUE") : String("FALSE"));
    finish(i, 200, health); return;
  }
  if (!headers.startsWith("POST /command HTTP/1.1\r\n")) { finish(i, 404, "BRIDGE,NOT_FOUND"); return; }
  int pos = lower.indexOf("\r\ncontent-length: ");
  if (pos < 0 || lower.indexOf("\r\ncontent-length:", pos + 2) >= 0) { finish(i, 400, "BRIDGE,INVALID_LENGTH"); return; }
  String len = headers.substring(pos + 18, headers.indexOf("\r\n", pos + 2));
  if (!len.length()) { finish(i, 400, "BRIDGE,INVALID_LENGTH"); return; }
  for (size_t n = 0; n < len.length(); ++n) if (!isDigit(len[n])) { finish(i, 400, "BRIDGE,INVALID_LENGTH"); return; }
  if (len.length() > 4 || len.toInt() < 1 || len.toInt() > 3000) { finish(i, 413, "BRIDGE,COMMAND_TOO_LONG"); return; }
  int size = len.toInt();
  if ((int)c.request.length() < end + 4 + size) return;
  String command = c.request.substring(end + 4);
  if ((int)command.length() != size) { finish(i, 400, "BRIDGE,ONE_COMMAND_ONLY"); return; }
  if (command.endsWith("\n")) command.remove(command.length() - 1);
  if (command.endsWith("\r")) command.remove(command.length() - 1);
  for (size_t n = 0; n < command.length(); ++n) if (command[n] < 32 || command[n] > 126) {
    finish(i, 400, "BRIDGE,INVALID_COMMAND"); return;
  }
  dispatch(i, command);
}
void setup() {
  Serial.begin(115200);
#if defined(ARDUINO_USB_MODE) && ARDUINO_USB_MODE && ARDUINO_USB_CDC_ON_BOOT
  Serial.setTxTimeoutMs(0);
#endif
  megaUart.begin(MEGA_UART_BAUD, SERIAL_8N1, ESP32_UART_RX_PIN, ESP32_UART_TX_PIN);
  recoveryAt = millis();
  if (strlen(BRIDGE_TOKEN) < 32 || String(BRIDGE_TOKEN) == "CHANGE_ME") {
    logLine("Configure a random BRIDGE_TOKEN of at least 32 characters; bridge disabled.");
    return;
  }
  WiFi.mode(WIFI_STA); WiFi.setAutoReconnect(true);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  // No UART command, ARM, NOTE, or motor activation on boot/reconnect.
}
void loop() {
  readMega();
  const bool connected = WiFi.status() == WL_CONNECTED;
  if (wasConnected && !connected) {
    logLine("Wi-Fi disconnected; wireless session revoked.");
    failSafe("BRIDGE,WIFI_LOST");
    for (int i = 0; i < (int)CLIENT_COUNT; ++i) { clients[i].socket.stop(); clients[i].waiting = false; clients[i].request = ""; }
  }
  if (connected && !wasConnected) { server.begin(); logLine("Bridge IP: " + WiFi.localIP().toString()); }
  wasConnected = connected;
  // Repeat diagnostics so a monitor opened after boot can still discover the IP.
  static unsigned long lastWifiLogAt = 0;
  if (millis() - lastWifiLogAt >= 5000) {
    lastWifiLogAt = millis();
    logLine("Wi-Fi status: " + String((int)WiFi.status()));
    if (connected) { logLine("Bridge IP: " + WiFi.localIP().toString()); }
  }
  if (pending != -1 && ((pending >= 0 && !clients[pending].socket.connected()) || millis() - sentAt >= UART_TIMEOUT_MS)) failSafe("BRIDGE,MEGA_TIMEOUT_OR_CLIENT_LOST");
  if (!connected) { delay(1); return; }
  WiFiClient incoming = server.available();
  if (incoming) {
    bool accepted = false;
    for (int i = 0; i < (int)CLIENT_COUNT; ++i) if (!clients[i].socket.connected() && !clients[i].waiting) {
      clients[i].socket = incoming; clients[i].request = ""; clients[i].started = millis(); accepted = true; break;
    }
    if (!accepted) incoming.stop();
  }
  for (int i = 0; i < (int)CLIENT_COUNT; ++i) {
    auto &c = clients[i];
    if (!c.socket.connected() || c.waiting) continue;
    if (millis() - c.started > 1000) { finish(i, 408, "BRIDGE,HTTP_TIMEOUT"); continue; }
    for (int n = 0; n < 128 && c.socket.available(); ++n) {
      c.request += (char)c.socket.read();
      if (c.request.length() > MAX_HTTP_BYTES) { finish(i, 413, "BRIDGE,REQUEST_TOO_LARGE"); break; }
    }
    if (c.socket.connected()) parseRequest(i);
  }
  tickSchedule();
  delay(1);
}

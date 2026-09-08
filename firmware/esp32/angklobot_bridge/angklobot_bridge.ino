#include <Arduino.h>

/*
 * Angklobot ESP32 Phase 2A UART bridge test.
 *
 * UART2 is used so the normal USB Serial port remains available for debugging.
 * GPIO16 (RX) and GPIO17 (TX) are common UART2 choices on classic ESP32 DevKit
 * boards. They are defined here rather than assumed by the code. Confirm these
 * pins are exposed and suitable on the exact ESP32 board before wiring it.
 *
 * This phase sends one NOTE parser test and preserves the PING/PONG heartbeat.
 * It contains no Wi-Fi, WebSocket, website, motor, or song-scheduling behavior.
 */

constexpr int ESP32_UART_RX_PIN = 16;
constexpr int ESP32_UART_TX_PIN = 17;
constexpr unsigned long USB_SERIAL_BAUD = 115200;
constexpr unsigned long MEGA_UART_BAUD = 115200;
constexpr unsigned long PING_INTERVAL_MS = 2000;
constexpr size_t RESPONSE_BUFFER_SIZE = 64;

HardwareSerial megaUart(2);

char responseBuffer[RESPONSE_BUFFER_SIZE];
size_t responseLength = 0;
bool discardingResponse = false;
unsigned long lastPingAt = 0;
bool noteTestSent = false;

void handleMegaResponse(const char *response) {
  Serial.print("Received from Mega: ");
  Serial.println(response);
}

void readMegaUart() {
  while (megaUart.available() > 0) {
    const char incoming = static_cast<char>(megaUart.read());

    if (incoming == '\n' || incoming == '\r') {
      if (discardingResponse) {
        discardingResponse = false;
        responseLength = 0;
        continue;
      }

      if (responseLength == 0) {
        continue;
      }

      responseBuffer[responseLength] = '\0';
      handleMegaResponse(responseBuffer);
      responseLength = 0;
      continue;
    }

    if (discardingResponse) {
      continue;
    }

    if (responseLength < RESPONSE_BUFFER_SIZE - 1) {
      responseBuffer[responseLength++] = incoming;
    } else {
      responseLength = 0;
      discardingResponse = true;
      Serial.println("Discarded overlong Mega response");
    }
  }
}

void sendPingWhenDue() {
  const unsigned long now = millis();
  if (now - lastPingAt < PING_INTERVAL_MS) {
    return;
  }

  megaUart.println("PING");
  Serial.println("Sent to Mega: PING");
  lastPingAt = now;
}

void sendNoteTestOnce() {
  if (noteTestSent) {
    return;
  }

  megaUart.println("NOTE,5,30,300");
  Serial.println("Sent to Mega: NOTE,5,30,300");
  noteTestSent = true;
  lastPingAt = millis();
}

void setup() {
  Serial.begin(USB_SERIAL_BAUD);
  megaUart.begin(
    MEGA_UART_BAUD,
    SERIAL_8N1,
    ESP32_UART_RX_PIN,
    ESP32_UART_TX_PIN
  );
  Serial.println("Angklobot ESP32 Phase 2A UART test ready");
}

void loop() {
  readMegaUart();
  sendNoteTestOnce();
  sendPingWhenDue();
}

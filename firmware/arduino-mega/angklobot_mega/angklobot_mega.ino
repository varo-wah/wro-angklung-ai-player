#include <Arduino.h>
#include <limits.h>
#include <string.h>

/*
 * Angklobot Arduino Mega 2560 Phase 2A UART parser test.
 *
 * Serial is reserved for USB Serial Monitor diagnostics.
 * Serial1 communicates with the ESP32 on RX1 pin 19 and TX1 pin 18.
 *
 * This phase preserves PING/PONG and validates NOTE command fields without
 * activating any motor. Motor control, the existing pin mappings and software
 * PWM system, safety logic, and song scheduling remain deferred.
 */

constexpr unsigned long USB_SERIAL_BAUD = 115200;
constexpr unsigned long ESP32_UART_BAUD = 115200;
constexpr size_t COMMAND_BUFFER_SIZE = 64;
constexpr long MIN_NOTE_ID = 1;
constexpr long MAX_NOTE_ID = 18;
constexpr long MIN_POWER_PERCENT = 0;
constexpr long MAX_POWER_PERCENT = 100;
constexpr long MIN_DURATION_MS = 1;
constexpr long MAX_DURATION_MS = 2000;

char commandBuffer[COMMAND_BUFFER_SIZE];
size_t commandLength = 0;
bool discardingCommand = false;

void sendError(const char *reason) {
  Serial1.print("ERROR,");
  Serial1.println(reason);

  Serial.print("Sent to ESP32: ERROR,");
  Serial.println(reason);
}

bool parseIntegerField(
  const char *&cursor,
  char expectedDelimiter,
  long &value
) {
  const bool negative = *cursor == '-';
  if (negative) {
    cursor++;
  }

  if (*cursor < '0' || *cursor > '9') {
    return false;
  }

  unsigned long magnitude = 0;
  const unsigned long maximumMagnitude = negative
    ? static_cast<unsigned long>(LONG_MAX) + 1UL
    : static_cast<unsigned long>(LONG_MAX);

  while (*cursor >= '0' && *cursor <= '9') {
    const unsigned long digit = static_cast<unsigned long>(*cursor - '0');
    if (magnitude > (maximumMagnitude - digit) / 10UL) {
      return false;
    }

    magnitude = magnitude * 10UL + digit;
    cursor++;
  }

  if (*cursor != expectedDelimiter) {
    return false;
  }

  if (expectedDelimiter != '\0') {
    cursor++;
  }

  if (negative && magnitude == static_cast<unsigned long>(LONG_MAX) + 1UL) {
    value = LONG_MIN;
  } else if (negative) {
    value = -static_cast<long>(magnitude);
  } else {
    value = static_cast<long>(magnitude);
  }
  return true;
}

void handleNoteCommand(const char *command) {
  const char *cursor = command + 5;
  long note = 0;
  long power = 0;
  long duration = 0;

  if (!parseIntegerField(cursor, ',', note) ||
      !parseIntegerField(cursor, ',', power) ||
      !parseIntegerField(cursor, '\0', duration)) {
    sendError("MALFORMED_COMMAND");
    return;
  }

  if (note < MIN_NOTE_ID || note > MAX_NOTE_ID) {
    sendError("INVALID_NOTE");
    return;
  }

  if (power < MIN_POWER_PERCENT || power > MAX_POWER_PERCENT) {
    sendError("INVALID_POWER");
    return;
  }

  if (duration < MIN_DURATION_MS || duration > MAX_DURATION_MS) {
    sendError("INVALID_DURATION");
    return;
  }

  Serial.print("NOTE parsed: note=");
  Serial.print(note);
  Serial.print(" power=");
  Serial.print(power);
  Serial.print(" duration=");
  Serial.println(duration);

  Serial1.print("OK,NOTE,");
  Serial1.print(note);
  Serial1.print(',');
  Serial1.print(power);
  Serial1.print(',');
  Serial1.println(duration);
}

void handleEsp32Command(const char *command) {
  Serial.print("Received from ESP32: ");
  Serial.println(command);

  if (strcmp(command, "PING") == 0) {
    Serial1.println("PONG");
    Serial.println("Sent to ESP32: PONG");
    return;
  }

  if (strncmp(command, "NOTE,", 5) == 0) {
    handleNoteCommand(command);
    return;
  }

  sendError("MALFORMED_COMMAND");
}

void readEsp32Uart() {
  while (Serial1.available() > 0) {
    const char incoming = static_cast<char>(Serial1.read());

    if (incoming == '\n' || incoming == '\r') {
      if (discardingCommand) {
        discardingCommand = false;
        commandLength = 0;
        continue;
      }

      if (commandLength == 0) {
        continue;
      }

      commandBuffer[commandLength] = '\0';
      handleEsp32Command(commandBuffer);
      commandLength = 0;
      continue;
    }

    if (discardingCommand) {
      continue;
    }

    if (commandLength < COMMAND_BUFFER_SIZE - 1) {
      commandBuffer[commandLength++] = incoming;
    } else {
      commandLength = 0;
      discardingCommand = true;
      sendError("MALFORMED_COMMAND");
    }
  }
}

void setup() {
  Serial.begin(USB_SERIAL_BAUD);
  Serial1.begin(ESP32_UART_BAUD);
  Serial.println("Angklobot Mega Phase 2A UART test ready");
}

void loop() {
  readEsp32Uart();
}

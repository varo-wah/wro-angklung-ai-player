#include <Arduino.h>
#include <stdlib.h>
#include <string.h>

const uint8_t CHANNEL_COUNT = 18;
const uint8_t IN1_PINS[CHANNEL_COUNT] = {
  6, 8, 2, 4, 26, 28, 30, 32, 10, 12, 22, 24, 36, 38, 40, 42, 44, 46
};
const uint8_t IN2_PINS[CHANNEL_COUNT] = {
  7, 9, 3, 5, 27, 29, 31, 33, 11, 13, 23, 25, 37, 39, 41, 43, 45, 47
};
const char NOTE_LABELS[CHANNEL_COUNT][3] = {
  "G3", "A3", "B3", "C4", "D4", "E4", "F4", "G4", "A4",
  "B4", "C5", "D5", "E5", "F5", "G5", "A5", "B5", "C6"
};
const uint8_t PHYSICAL_ANGKLUNG_NUMBERS[CHANNEL_COUNT] = {
  5, 6, 7, 1, 2, 3, 4, 5, 6, 7, 1, 2, 3, 4, 5, 6, 7, 1
};

// RAM-only calibration values. Copy proven values back here before the final
// firmware build. Tune only one actuator at a time under supervised power.
uint8_t motorPowerPercent[18] = {
  20, 20, 20, 20, 20, 20, 20, 20, 20,
  20, 20, 20, 20, 20, 20, 20, 20, 20
};
uint16_t motorPulseMs[18] = {
  120, 120, 120, 120, 120, 120, 120, 120, 120,
  120, 120, 120, 120, 120, 120, 120, 120, 120
};

const uint8_t PROTOCOL_VERSION = 1;
const unsigned long SERIAL_BAUD = 115200;
const uint16_t PWM_PERIOD_US = 1000;
const unsigned long MAX_PULSE_DURATION_MS = 180;
const unsigned long MAX_REQUESTED_DURATION_MS = 5000;
const uint8_t MAX_CALIBRATION_POWER_PERCENT = 60;
const uint16_t MIN_CALIBRATION_PULSE_MS = 50;
const uint8_t COMMAND_BUFFER_SIZE = 64;
const uint8_t MAX_SERIAL_BYTES_PER_LOOP = 32;

struct MotorState {
  bool active;
  bool outputHigh;
  uint16_t dutyPermille;
  unsigned long pulseEndMs;
  unsigned long pwmCycleStartUs;
};

MotorState motors[CHANNEL_COUNT];
char commandBuffer[COMMAND_BUFFER_SIZE];
uint8_t commandLength = 0;
bool discardCommandUntilNewline = false;
bool armed = false;

void writeMotorPinsLow(uint8_t channel) {
  digitalWrite(IN1_PINS[channel], LOW);
  digitalWrite(IN2_PINS[channel], LOW);
}

void stopMotor(uint8_t channel) {
  writeMotorPinsLow(channel);
  motors[channel].active = false;
  motors[channel].outputHigh = false;
  motors[channel].dutyPermille = 0;
}

void allOff() {
  for (uint8_t channel = 0; channel < CHANNEL_COUNT; channel++) {
    stopMotor(channel);
  }
}

bool deadlineReached(unsigned long now, unsigned long deadline) {
  return (long)(now - deadline) >= 0;
}

void startMotorPulse(uint8_t channel, unsigned long requestedDurationMs, uint16_t strength) {
  const unsigned long durationMs = min(requestedDurationMs, MAX_PULSE_DURATION_MS);
  const uint16_t calibratedDutyPermille = (uint16_t)motorPowerPercent[channel] * 10U;
  const uint16_t dutyPermille =
    (uint32_t)calibratedDutyPermille * strength / 1000UL;

  writeMotorPinsLow(channel);
  motors[channel].active = dutyPermille > 0;
  motors[channel].outputHigh = false;
  motors[channel].dutyPermille = dutyPermille;
  motors[channel].pulseEndMs = millis() + durationMs;
  motors[channel].pwmCycleStartUs = micros();
}

void updateMotorPulseExpiry() {
  const unsigned long nowMs = millis();
  for (uint8_t channel = 0; channel < CHANNEL_COUNT; channel++) {
    if (motors[channel].active && deadlineReached(nowMs, motors[channel].pulseEndMs)) {
      stopMotor(channel);
    }
  }
}

void updateSoftwarePwm() {
  const unsigned long nowUs = micros();
  for (uint8_t channel = 0; channel < CHANNEL_COUNT; channel++) {
    MotorState &motor = motors[channel];
    if (!motor.active) {
      continue;
    }

    unsigned long phaseUs = nowUs - motor.pwmCycleStartUs;
    if (phaseUs >= PWM_PERIOD_US) {
      motor.pwmCycleStartUs += (phaseUs / PWM_PERIOD_US) * PWM_PERIOD_US;
      phaseUs %= PWM_PERIOD_US;
    }

    const unsigned long onTimeUs =
      (unsigned long)PWM_PERIOD_US * motor.dutyPermille / 1000UL;
    const bool shouldBeHigh = phaseUs < onTimeUs;
    if (shouldBeHigh != motor.outputHigh) {
      digitalWrite(IN1_PINS[channel], shouldBeHigh ? HIGH : LOW);
      motor.outputHigh = shouldBeHigh;
    }
  }
}

void enforceDisarmedState() {
  if (armed) {
    return;
  }
  for (uint8_t channel = 0; channel < CHANNEL_COUNT; channel++) {
    if (motors[channel].active || motors[channel].outputHigh) {
      stopMotor(channel);
    }
  }
}

uint8_t countCommas(const char *text) {
  uint8_t count = 0;
  while (*text != '\0') {
    if (*text == ',') {
      count++;
    }
    text++;
  }
  return count;
}

bool parseLongInRange(const char *text, long minimum, long maximum, long &result) {
  if (text == NULL || *text == '\0') {
    return false;
  }
  for (const char *cursor = text; *cursor != '\0'; cursor++) {
    if (*cursor < '0' || *cursor > '9') {
      return false;
    }
  }

  char *end = NULL;
  const long parsed = strtol(text, &end, 10);
  if (end == text || *end != '\0' || parsed < minimum || parsed > maximum) {
    return false;
  }

  result = parsed;
  return true;
}

void handleNoteCommand(char *command) {
  if (countCommas(command) != 3) {
    Serial.println(F("ERROR,INVALID_NOTE"));
    return;
  }

  char *channelText = strtok(command + 5, ",");
  char *durationText = strtok(NULL, ",");
  char *strengthText = strtok(NULL, ",");
  long channel;
  long durationMs;
  long strength;

  if (!parseLongInRange(channelText, 0, CHANNEL_COUNT - 1, channel)) {
    Serial.println(F("ERROR,INVALID_CHANNEL"));
    return;
  }
  if (!parseLongInRange(durationText, 1, MAX_REQUESTED_DURATION_MS, durationMs)) {
    Serial.println(F("ERROR,INVALID_DURATION"));
    return;
  }
  if (!parseLongInRange(strengthText, 0, 1000, strength)) {
    Serial.println(F("ERROR,INVALID_STRENGTH"));
    return;
  }
  if (!armed) {
    Serial.println(F("ERROR,NOT_ARMED"));
    return;
  }

  startMotorPulse((uint8_t)channel, (unsigned long)durationMs, (uint16_t)strength);
  Serial.print(F("ACK,NOTE,"));
  Serial.println(channel);
}

void handleTestCommand(char *command) {
  if (countCommas(command) != 1) {
    Serial.println(F("ERROR,INVALID_TEST"));
    return;
  }

  long channel;
  if (!parseLongInRange(command + 5, 0, CHANNEL_COUNT - 1, channel)) {
    Serial.println(F("ERROR,INVALID_CHANNEL"));
    return;
  }
  if (!armed) {
    Serial.println(F("ERROR,NOT_ARMED"));
    return;
  }

  // Calibration testing is deliberately exclusive even if a website pulse
  // was active immediately before the operator entered this command.
  allOff();
  startMotorPulse((uint8_t)channel, motorPulseMs[channel], 1000);
  Serial.print(F("ACK,TEST,"));
  Serial.print(channel);
  Serial.print(F(",POWER="));
  Serial.print(motorPowerPercent[channel]);
  Serial.print(F(",PULSE="));
  Serial.println(motorPulseMs[channel]);
}

void handlePowerCommand(char *command) {
  if (countCommas(command) != 2) {
    Serial.println(F("ERROR,INVALID_POWER"));
    return;
  }

  char *channelText = strtok(command + 6, ",");
  char *percentText = strtok(NULL, ",");
  long channel;
  long percent;
  if (!parseLongInRange(channelText, 0, CHANNEL_COUNT - 1, channel)) {
    Serial.println(F("ERROR,INVALID_CHANNEL"));
    return;
  }
  if (!parseLongInRange(percentText, 0, MAX_CALIBRATION_POWER_PERCENT, percent)) {
    Serial.println(F("ERROR,INVALID_POWER"));
    return;
  }

  motorPowerPercent[channel] = (uint8_t)percent;
  Serial.print(F("ACK,POWER,"));
  Serial.print(channel);
  Serial.print(',');
  Serial.println(percent);
}

void handlePulseCommand(char *command) {
  if (countCommas(command) != 2) {
    Serial.println(F("ERROR,INVALID_PULSE"));
    return;
  }

  char *channelText = strtok(command + 6, ",");
  char *pulseText = strtok(NULL, ",");
  long channel;
  long pulseMs;
  if (!parseLongInRange(channelText, 0, CHANNEL_COUNT - 1, channel)) {
    Serial.println(F("ERROR,INVALID_CHANNEL"));
    return;
  }
  if (!parseLongInRange(pulseText, MIN_CALIBRATION_PULSE_MS, MAX_PULSE_DURATION_MS, pulseMs)) {
    Serial.println(F("ERROR,INVALID_PULSE"));
    return;
  }

  motorPulseMs[channel] = (uint16_t)pulseMs;
  Serial.print(F("ACK,PULSE,"));
  Serial.print(channel);
  Serial.print(',');
  Serial.println(pulseMs);
}

void printCalibration(uint8_t channel) {
  Serial.print(F("CAL,"));
  Serial.print(channel);
  Serial.print(',');
  Serial.print(NOTE_LABELS[channel]);
  Serial.print(F(",ANGKLUNG="));
  Serial.print(PHYSICAL_ANGKLUNG_NUMBERS[channel]);
  Serial.print(F(",POWER="));
  Serial.print(motorPowerPercent[channel]);
  Serial.print(F(",PULSE="));
  Serial.print(motorPulseMs[channel]);
  Serial.print(F(",IN1="));
  Serial.print(IN1_PINS[channel]);
  Serial.print(F(",IN2="));
  Serial.println(IN2_PINS[channel]);
}

void handleCalibrationCommand(char *command) {
  if (countCommas(command) != 1) {
    Serial.println(F("ERROR,INVALID_CAL"));
    return;
  }

  long channel;
  if (!parseLongInRange(command + 4, 0, CHANNEL_COUNT - 1, channel)) {
    Serial.println(F("ERROR,INVALID_CHANNEL"));
    return;
  }
  printCalibration((uint8_t)channel);
}

void handleCommand(char *command) {
  for (uint8_t index = 0; command[index] != '\0'; index++) {
    if (command[index] >= 'a' && command[index] <= 'z') {
      command[index] -= ('a' - 'A');
    }
  }

  if (strcmp(command, "HELLO,1") == 0) {
    Serial.println(F("READY,1,ACTIVE"));
    return;
  }
  if (strncmp(command, "HELLO,", 6) == 0) {
    Serial.println(F("ERROR,PROTOCOL_VERSION"));
    return;
  }
  if (strncmp(command, "NOTE,", 5) == 0) {
    handleNoteCommand(command);
    return;
  }
  if (strncmp(command, "TEST,", 5) == 0) {
    handleTestCommand(command);
    return;
  }
  if (strncmp(command, "POWER,", 6) == 0) {
    handlePowerCommand(command);
    return;
  }
  if (strncmp(command, "PULSE,", 6) == 0) {
    handlePulseCommand(command);
    return;
  }
  if (strncmp(command, "CAL,", 4) == 0) {
    handleCalibrationCommand(command);
    return;
  }
  if (strcmp(command, "CALALL") == 0) {
    // A full report can fill the serial transmit buffer. Stop outputs first so
    // diagnostic printing cannot stretch an active PWM pulse.
    allOff();
    for (uint8_t channel = 0; channel < CHANNEL_COUNT; channel++) {
      printCalibration(channel);
    }
    return;
  }
  if (strcmp(command, "ARM") == 0) {
    allOff();
    armed = true;
    Serial.println(F("ACK,ARM"));
    return;
  }
  if (strcmp(command, "ALL_OFF") == 0 || strcmp(command, "STOP") == 0) {
    allOff();
    Serial.println(F("ACK,ALL_OFF"));
    return;
  }
  if (strcmp(command, "DISARM") == 0 || strcmp(command, "ESTOP") == 0) {
    armed = false;
    allOff();
    Serial.println(F("ACK,DISARM"));
    return;
  }
  if (strcmp(command, "STATUS") == 0) {
    Serial.print(F("STATUS,READY,PROTOCOL=1,MODE=FULL18,ARMED="));
    Serial.println(armed ? F("TRUE") : F("FALSE"));
    return;
  }

  Serial.println(F("ERROR,UNKNOWN_COMMAND"));
}

void readSerial() {
  uint8_t bytesRead = 0;
  while (Serial.available() > 0 && bytesRead < MAX_SERIAL_BYTES_PER_LOOP) {
    const char incoming = Serial.read();
    bytesRead++;

    if (incoming == '\n' || incoming == '\r') {
      if (!discardCommandUntilNewline && commandLength > 0) {
        commandBuffer[commandLength] = '\0';
        handleCommand(commandBuffer);
      }
      commandLength = 0;
      discardCommandUntilNewline = false;
      continue;
    }

    if (discardCommandUntilNewline) {
      continue;
    }
    if (commandLength < COMMAND_BUFFER_SIZE - 1) {
      commandBuffer[commandLength++] = incoming;
    } else {
      commandLength = 0;
      discardCommandUntilNewline = true;
      Serial.println(F("ERROR,COMMAND_TOO_LONG"));
    }
  }
}

void setup() {
  armed = false;
  for (uint8_t channel = 0; channel < CHANNEL_COUNT; channel++) {
    digitalWrite(IN1_PINS[channel], LOW);
    digitalWrite(IN2_PINS[channel], LOW);
    pinMode(IN1_PINS[channel], OUTPUT);
    pinMode(IN2_PINS[channel], OUTPUT);
    stopMotor(channel);
  }

  Serial.begin(SERIAL_BAUD);
  Serial.println(F("ANGKLOBOT FULL 18 READY - OUTPUTS DISARMED"));
  Serial.println(F("Commands:"));
  Serial.println(F("ARM"));
  Serial.println(F("DISARM"));
  Serial.println(F("ALL_OFF"));
  Serial.println(F("STATUS"));
  Serial.println(F("TEST,<0-17>"));
  Serial.println(F("POWER,<channel>,<0-60>"));
  Serial.println(F("PULSE,<channel>,<50-180>"));
  Serial.println(F("CAL,<channel>"));
  Serial.println(F("CALALL"));
}

void loop() {
  readSerial();
  updateMotorPulseExpiry();
  updateSoftwarePwm();
  enforceDisarmedState();
}

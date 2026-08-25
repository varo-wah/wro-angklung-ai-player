#include <Arduino.h>
#include <stdlib.h>
#include <string.h>

// Numbered angklungs are interpreted on the G3-C6 rack as:
// 5 = G3, 7 = B3, 2 = D4, 4 = F4.
const uint8_t NOTE_COUNT = 4;
const uint8_t DRIVE_PINS[NOTE_COUNT] = {6, 8, 10, 12};
const uint8_t RETURN_PINS[NOTE_COUNT] = {7, 9, 11, 13};
const int LOGICAL_CHANNELS[NOTE_COUNT] = {0, 2, 4, 6};
const char *NOTE_LABELS[NOTE_COUNT] = {"5/G3", "7/B3", "2/D4", "4/F4"};
const char *MANUAL_COMMANDS[NOTE_COUNT] = {"5", "7", "2", "4"};

const int MOTOR_POWER = 100;  // Conservative PWM ceiling, 0-255.
const unsigned long PULSE_MS = 180;
const unsigned long SERIAL_BAUD = 115200;
const uint8_t COMMAND_BUFFER_SIZE = 64;

char commandBuffer[COMMAND_BUFFER_SIZE];
uint8_t commandLength = 0;
bool noteActive[NOTE_COUNT] = {false, false, false, false};
unsigned long noteEndTime[NOTE_COUNT] = {0, 0, 0, 0};
bool armed = false;

bool routineRunning = false;
unsigned long routineStart = 0;
uint8_t routineStep = 0;

void stopNote(uint8_t index) {
  analogWrite(DRIVE_PINS[index], 0);
  digitalWrite(RETURN_PINS[index], LOW);
  noteActive[index] = false;
}

void allOff() {
  for (uint8_t index = 0; index < NOTE_COUNT; index++) {
    stopNote(index);
  }
}

void pulseNote(uint8_t index, unsigned long duration, int power = MOTOR_POWER) {
  digitalWrite(RETURN_PINS[index], LOW);
  analogWrite(DRIVE_PINS[index], power);
  noteActive[index] = true;
  noteEndTime[index] = millis() + duration;

  Serial.print("PLAY:");
  Serial.println(NOTE_LABELS[index]);
}

void updatePulses() {
  const unsigned long now = millis();
  for (uint8_t index = 0; index < NOTE_COUNT; index++) {
    if (noteActive[index] && (long)(now - noteEndTime[index]) >= 0) {
      stopNote(index);
    }
  }
}

int findNoteByChannel(int channel) {
  for (uint8_t index = 0; index < NOTE_COUNT; index++) {
    if (LOGICAL_CHANNELS[index] == channel) {
      return index;
    }
  }
  return -1;
}

int findNoteByManualCommand(const char *command) {
  for (uint8_t index = 0; index < NOTE_COUNT; index++) {
    if (strcmp(command, MANUAL_COMMANDS[index]) == 0) {
      return index;
    }
  }
  return -1;
}

void handleWebsiteNote(int channel, unsigned long duration, int strength) {
  if (!armed) {
    Serial.println("ERROR,NOT_ARMED");
    return;
  }

  const int noteIndex = findNoteByChannel(channel);
  if (noteIndex < 0) {
    Serial.println("ERROR,UNMAPPED_CHANNEL");
    return;
  }

  duration = min(duration, PULSE_MS);
  if (duration < 1) {
    Serial.println("ERROR,INVALID_DURATION");
    return;
  }

  strength = constrain(strength, 0, 1000);
  const int pwm = map(strength, 0, 1000, 0, MOTOR_POWER);
  pulseNote((uint8_t)noteIndex, duration, pwm);

  Serial.print("ACK,NOTE,");
  Serial.println(channel);
}

void startRoutine() {
  allOff();
  routineRunning = true;
  routineStart = millis();
  routineStep = 0;
  Serial.println("ROUTINE,STARTED");
}

void updateRoutine() {
  if (!routineRunning) {
    return;
  }

  const unsigned long elapsed = millis() - routineStart;
  if (routineStep < NOTE_COUNT && elapsed >= (unsigned long)(routineStep + 1) * 1000UL) {
    pulseNote(routineStep, PULSE_MS);
    routineStep++;
  }

  if (routineStep == NOTE_COUNT && elapsed >= 4500UL) {
    routineRunning = false;
    Serial.println("ROUTINE,COMPLETE");
  }
}

void handleCommand(char *command) {
  for (uint8_t index = 0; command[index] != '\0'; index++) {
    if (command[index] >= 'a' && command[index] <= 'z') {
      command[index] -= ('a' - 'A');
    }
  }

  if (strcmp(command, "HELLO,1") == 0) {
    Serial.println("READY,1,ACTIVE");
    return;
  }

  if (strncmp(command, "HELLO,", 6) == 0) {
    Serial.println("ERROR,PROTOCOL_VERSION");
    return;
  }

  if (strncmp(command, "NOTE,", 5) == 0) {
    char *channelText = strtok(command + 5, ",");
    char *durationText = strtok(NULL, ",");
    char *strengthText = strtok(NULL, ",");
    if (channelText == NULL || durationText == NULL || strengthText == NULL) {
      Serial.println("ERROR,INVALID_NOTE");
      return;
    }

    handleWebsiteNote(
      atoi(channelText),
      strtoul(durationText, NULL, 10),
      atoi(strengthText)
    );
    return;
  }

  if (strcmp(command, "ESTOP") == 0 || strcmp(command, "DISARM") == 0) {
    routineRunning = false;
    armed = false;
    allOff();
    Serial.println("ACK,DISARM");
    return;
  }

  if (strcmp(command, "STOP") == 0 || strcmp(command, "ALL_OFF") == 0) {
    routineRunning = false;
    allOff();
    Serial.println("ACK,ALL_OFF");
    return;
  }

  if (strcmp(command, "ARM") == 0) {
    allOff();
    armed = true;
    Serial.println("ACK,ARM");
    return;
  }

  if (strcmp(command, "STATUS") == 0) {
    Serial.print("STATUS,READY,ARMED=");
    Serial.println(armed ? "TRUE" : "FALSE");
    return;
  }

  if (strcmp(command, "RUN") == 0) {
    if (!armed) {
      Serial.println("ERROR,NOT_ARMED");
      return;
    }
    startRoutine();
    return;
  }

  const int manualNote = findNoteByManualCommand(command);
  if (manualNote >= 0) {
    if (!armed) {
      Serial.println("ERROR,NOT_ARMED");
      return;
    }
    pulseNote((uint8_t)manualNote, PULSE_MS);
    return;
  }

  Serial.println("ERROR,UNKNOWN_COMMAND");
}

void readSerial() {
  while (Serial.available() > 0) {
    const char incoming = Serial.read();
    if (incoming == '\n' || incoming == '\r') {
      if (commandLength > 0) {
        commandBuffer[commandLength] = '\0';
        handleCommand(commandBuffer);
        commandLength = 0;
      }
      continue;
    }

    if (commandLength < COMMAND_BUFFER_SIZE - 1) {
      commandBuffer[commandLength++] = incoming;
    } else {
      commandLength = 0;
      Serial.println("ERROR,COMMAND_TOO_LONG");
    }
  }
}

void setup() {
  for (uint8_t index = 0; index < NOTE_COUNT; index++) {
    pinMode(DRIVE_PINS[index], OUTPUT);
    pinMode(RETURN_PINS[index], OUTPUT);
  }
  allOff();

  Serial.begin(SERIAL_BAUD);
  Serial.println("ANGKLOBOT MEGA 5-7-2-4 READY; OUTPUTS DISARMED");
  Serial.println("Commands: ARM 5 7 2 4 RUN STOP DISARM STATUS");
}

void loop() {
  readSerial();
  updatePulses();
  updateRoutine();
}

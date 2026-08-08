#include <Arduino.h>

// IMPORTANT: These pins must connect to suitable driver inputs, not directly
// to motors or solenoids. Confirm the driver, external power, common ground,
// flyback protection, and physical emergency stop before changing this to true.
constexpr bool HARDWARE_CONFIGURATION_CONFIRMED = false;

enum class PairDriveMode : uint8_t {
  // Use when both pins are independent active-HIGH driver inputs for one note.
  DUAL_ACTIVE_HIGH,
  // Use when the pair is IN1/IN2 on an H-bridge and HIGH/LOW drives forward.
  HBRIDGE_FORWARD,
};

constexpr PairDriveMode PAIR_DRIVE_MODE = PairDriveMode::DUAL_ACTIVE_HIGH;
constexpr unsigned long SERIAL_BAUD = 115200;
constexpr unsigned long PULSE_DURATION_MS = 180;
constexpr size_t COMMAND_BUFFER_SIZE = 24;

struct PinPair {
  uint8_t first;
  uint8_t second;
};

constexpr PinPair SOL_PINS = {3, 5};
constexpr PinPair MI_PINS = {9, 10};
constexpr PinPair DO_PINS = {11, 12};

enum NoteMask : uint8_t {
  NOTE_NONE = 0,
  NOTE_DO = 1 << 0,
  NOTE_MI = 1 << 1,
  NOTE_SOL = 1 << 2,
};

struct RoutineStep {
  unsigned long startOffsetMs;
  uint8_t noteMask;
  const char *label;
};

// Matches the website trial: Do, Mi, Sol, then the full octave-5 chord.
constexpr RoutineStep ROUTINE[] = {
    {1000, NOTE_DO, "Do / C5"},
    {2000, NOTE_MI, "Mi / E5"},
    {3000, NOTE_SOL, "Sol / G5"},
    {5000, NOTE_DO | NOTE_MI | NOTE_SOL, "C5 + E5 + G5 chord"},
};
constexpr size_t ROUTINE_STEP_COUNT = sizeof(ROUTINE) / sizeof(ROUTINE[0]);

bool armed = false;
bool routineRunning = false;
bool pulseActive = false;
unsigned long routineStartedAtMs = 0;
unsigned long pulseEndsAtMs = 0;
size_t nextRoutineStep = 0;
char commandBuffer[COMMAND_BUFFER_SIZE] = {};
size_t commandLength = 0;

void setPairActive(const PinPair &pins) {
  if (PAIR_DRIVE_MODE == PairDriveMode::DUAL_ACTIVE_HIGH) {
    digitalWrite(pins.first, HIGH);
    digitalWrite(pins.second, HIGH);
    return;
  }

  // Set the inactive side first to avoid a brief high/high transition.
  digitalWrite(pins.second, LOW);
  digitalWrite(pins.first, HIGH);
}

void setPairInactive(const PinPair &pins) {
  digitalWrite(pins.first, LOW);
  digitalWrite(pins.second, LOW);
}

void allOutputsOff() {
  setPairInactive(DO_PINS);
  setPairInactive(MI_PINS);
  setPairInactive(SOL_PINS);
  pulseActive = false;
}

void startPulse(uint8_t noteMask, const char *label) {
  if (!armed || !HARDWARE_CONFIGURATION_CONFIRMED) {
    Serial.println(F("REJECTED: outputs are not armed."));
    return;
  }

  allOutputsOff();
  if ((noteMask & NOTE_DO) != 0) {
    setPairActive(DO_PINS);
  }
  if ((noteMask & NOTE_MI) != 0) {
    setPairActive(MI_PINS);
  }
  if ((noteMask & NOTE_SOL) != 0) {
    setPairActive(SOL_PINS);
  }

  pulseActive = true;
  pulseEndsAtMs = millis() + PULSE_DURATION_MS;
  Serial.print(F("PLAY: "));
  Serial.println(label);
}

void emergencyStop() {
  allOutputsOff();
  routineRunning = false;
  nextRoutineStep = 0;
  Serial.println(F("STOPPED: all outputs LOW."));
}

void startRoutine() {
  if (!armed || !HARDWARE_CONFIGURATION_CONFIRMED) {
    Serial.println(F("REJECTED: send ARM after confirming the hardware configuration."));
    return;
  }

  allOutputsOff();
  routineRunning = true;
  nextRoutineStep = 0;
  routineStartedAtMs = millis();
  Serial.println(F("RUNNING: Do at 1s, Mi at 2s, Sol at 3s, chord at 5s."));
}

void printStatus() {
  Serial.print(F("configuration_confirmed="));
  Serial.println(HARDWARE_CONFIGURATION_CONFIRMED ? F("true") : F("false"));
  Serial.print(F("armed="));
  Serial.println(armed ? F("true") : F("false"));
  Serial.print(F("routine="));
  Serial.println(routineRunning ? F("running") : F("stopped"));
  Serial.print(F("pair_mode="));
  Serial.println(PAIR_DRIVE_MODE == PairDriveMode::DUAL_ACTIVE_HIGH ? F("DUAL_ACTIVE_HIGH") : F("HBRIDGE_FORWARD"));
}

void handleCommand(char *command) {
  for (char *cursor = command; *cursor != '\0'; ++cursor) {
    if (*cursor >= 'a' && *cursor <= 'z') {
      *cursor = static_cast<char>(*cursor - ('a' - 'A'));
    }
  }

  if (strcmp(command, "STOP") == 0 || strcmp(command, "ESTOP") == 0) {
    emergencyStop();
  } else if (strcmp(command, "DISARM") == 0) {
    emergencyStop();
    armed = false;
    Serial.println(F("DISARMED."));
  } else if (strcmp(command, "ARM") == 0) {
    if (!HARDWARE_CONFIGURATION_CONFIRMED) {
      Serial.println(F("REJECTED: set HARDWARE_CONFIGURATION_CONFIRMED=true only after hardware review."));
      return;
    }
    armed = true;
    Serial.println(F("ARMED. Use DO, MI, SOL, CHORD, RUN, STOP, or DISARM."));
  } else if (strcmp(command, "RUN") == 0) {
    startRoutine();
  } else if (strcmp(command, "DO") == 0) {
    routineRunning = false;
    startPulse(NOTE_DO, "Do / C5");
  } else if (strcmp(command, "MI") == 0) {
    routineRunning = false;
    startPulse(NOTE_MI, "Mi / E5");
  } else if (strcmp(command, "SOL") == 0) {
    routineRunning = false;
    startPulse(NOTE_SOL, "Sol / G5");
  } else if (strcmp(command, "CHORD") == 0) {
    routineRunning = false;
    startPulse(NOTE_DO | NOTE_MI | NOTE_SOL, "C5 + E5 + G5 chord");
  } else if (strcmp(command, "STATUS") == 0) {
    printStatus();
  } else if (*command != '\0') {
    Serial.println(F("UNKNOWN: use ARM, DO, MI, SOL, CHORD, RUN, STOP, DISARM, or STATUS."));
  }
}

void readSerialCommands() {
  while (Serial.available() > 0) {
    const char incoming = static_cast<char>(Serial.read());
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
      Serial.println(F("REJECTED: command is too long."));
    }
  }
}

void updatePulse() {
  if (pulseActive && static_cast<long>(millis() - pulseEndsAtMs) >= 0) {
    allOutputsOff();
  }
}

void updateRoutine() {
  if (!routineRunning || pulseActive) {
    return;
  }

  if (nextRoutineStep >= ROUTINE_STEP_COUNT) {
    routineRunning = false;
    Serial.println(F("COMPLETE: routine finished; outputs are LOW."));
    return;
  }

  const unsigned long elapsedMs = millis() - routineStartedAtMs;
  const RoutineStep &step = ROUTINE[nextRoutineStep];
  if (elapsedMs >= step.startOffsetMs) {
    startPulse(step.noteMask, step.label);
    ++nextRoutineStep;
  }
}

void setup() {
  pinMode(DO_PINS.first, OUTPUT);
  pinMode(DO_PINS.second, OUTPUT);
  pinMode(MI_PINS.first, OUTPUT);
  pinMode(MI_PINS.second, OUTPUT);
  pinMode(SOL_PINS.first, OUTPUT);
  pinMode(SOL_PINS.second, OUTPUT);
  allOutputsOff();

  Serial.begin(SERIAL_BAUD);
  Serial.println(F("Angklobot Do-Mi-Sol fallback ready. Outputs are LOW and disarmed."));
  printStatus();
}

void loop() {
  readSerialCommands();
  updatePulse();
  updateRoutine();
}

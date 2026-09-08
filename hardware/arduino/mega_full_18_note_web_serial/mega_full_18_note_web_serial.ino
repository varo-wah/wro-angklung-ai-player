#include <Arduino.h>
#include <stdlib.h>
#include <string.h>

// =============================================================================
// [L001] ANGKLOBOT FULL 18 NOTE + CALIBRATION + CONTINUOUS TEST FIRMWARE
// =============================================================================

const uint8_t CHANNEL_COUNT = 18;

// =============================================================================
// [L010] MOTOR PIN MAPPING
// =============================================================================
//
// Channel:
//  0 = G3
//  1 = A3
//  2 = B3
//  3 = C4
//  4 = D4
//  5 = E4
//  6 = F4
//  7 = G4
//  8 = A4
//  9 = B4
// 10 = C5
// 11 = D5
// 12 = E5
// 13 = F5
// 14 = G5
// 15 = A5
// 16 = B5
// 17 = C6
//
// Current upper mapping:
// G5 = 40 / 41
// A5 = 38 / 39
// B5 = 44 / 45
// C6 = 42 / 43

const uint8_t IN1_PINS[CHANNEL_COUNT] = {
  6, 8, 2, 4, 28, 26, 32, 30, 12,
  10, 24, 22, 36, 34, 41, 38, 44, 42
};

const uint8_t IN2_PINS[CHANNEL_COUNT] = {
  7, 9, 3, 5, 29, 27, 33, 31, 14,
  11, 25, 23, 37, 35, 42, 39, 45, 43
};

const char NOTE_LABELS[CHANNEL_COUNT][3] = {
  "G3", "A3", "B3",
  "C4", "D4", "E4", "F4", "G4", "A4", "B4",
  "C5", "D5", "E5", "F5", "G5", "A5", "B5",
  "C6"
};

const uint8_t PHYSICAL_ANGKLUNG_NUMBERS[CHANNEL_COUNT] = {
  5, 6, 7,
  1, 2, 3, 4, 5, 6, 7,
  1, 2, 3, 4, 5, 6, 7,
  1
};

// =============================================================================
// [L041] MOTOR CALIBRATION DEFAULTS
// =============================================================================
//
// These are the current default motor-power values.
//
// Later:
//
// POWER,<channel>,<percent>
//
// modifies one value during calibration.
//
// Example:
//
// POWER,10,37
//
// sets C5 / channel 10 to 37%.
//

uint8_t motorPowerPercent[CHANNEL_COUNT] = {
  30, 30, 30,
  30, 30, 30, 35, 35, 25, 15,
  35, 20, 20, 25, 25, 25, 25,
  25
};

uint16_t motorPulseMs[CHANNEL_COUNT] = {
  550, 550, 550,
  550, 550, 550, 550, 550, 550, 550,
  550, 550, 550, 550, 550, 550, 550,
  550
};

// =============================================================================
// [L060] SYSTEM CONSTANTS
// =============================================================================

const uint8_t PROTOCOL_VERSION = 1;

const unsigned long SERIAL_BAUD = 115200;

const uint16_t PWM_PERIOD_US = 1000;

// Normal timed pulses are capped here.
const unsigned long MAX_PULSE_DURATION_MS = 5000;

// Website NOTE requests may request longer musical durations,
// although actual physical pulse remains capped above.
const unsigned long MAX_REQUESTED_DURATION_MS = 5000;

// Calibration power ceiling.
const uint8_t MAX_CALIBRATION_POWER_PERCENT = 60;

const uint16_t MIN_CALIBRATION_PULSE_MS = 50;

const uint16_t DEFAULT_SWEEP_GAP_MS = 300;

const uint16_t MIN_SWEEP_GAP_MS = 50;

const uint16_t MAX_SWEEP_GAP_MS = 2000;

const uint8_t COMMAND_BUFFER_SIZE = 96;

const uint8_t MAX_SERIAL_BYTES_PER_LOOP = 32;

// =============================================================================
// [L074] MOTOR STATE
// =============================================================================

struct MotorState {
  bool active;

  bool outputHigh;

  // TRUE means this motor ignores pulseEndMs
  // and keeps running until explicitly stopped.
  bool continuous;

  uint16_t dutyPermille;

  unsigned long pulseEndMs;

  unsigned long pwmCycleStartUs;
};

MotorState motors[CHANNEL_COUNT];

// =============================================================================
// ROUTINE TYPES
// =============================================================================

enum RoutineMode {
  ROUTINE_NONE,
  ROUTINE_NOTE_SWEEP,
  ROUTINE_CAL_SWEEP
};

RoutineMode routineMode = ROUTINE_NONE;

// =============================================================================
// SERIAL STATE
// =============================================================================

char commandBuffer[COMMAND_BUFFER_SIZE];

uint8_t commandLength = 0;

bool discardCommandUntilNewline = false;

// =============================================================================
// SYSTEM STATE
// =============================================================================

bool armed = false;

bool calibrationMode = false;

// =============================================================================
// ROUTINE STATE
// =============================================================================

bool routineWaitingGap = false;

unsigned long routineNextActionMs = 0;

uint8_t routineChannel = 0;

uint16_t routineGapMs = DEFAULT_SWEEP_GAP_MS;

// =============================================================================
// NORMAL SWEEP STATE
// =============================================================================

bool sweepUseFixedPower = false;

uint8_t sweepPowerPercent = 30;

uint16_t sweepPulseMs = 400;

// =============================================================================
// CALSWEEP STATE
// =============================================================================

uint8_t calSweepEndPower = 60;

uint8_t calSweepStepPower = 5;

uint8_t calSweepCurrentPower = 20;

uint16_t calSweepPulseMs = 500;

// =============================================================================
// [L110] BASIC MOTOR FUNCTIONS
// =============================================================================

void writeMotorPinsLow(uint8_t channel) {
  digitalWrite(IN1_PINS[channel], LOW);
  digitalWrite(IN2_PINS[channel], LOW);
}

// -----------------------------------------------------------------------------

void stopMotor(uint8_t channel) {
  writeMotorPinsLow(channel);

  motors[channel].active = false;
  motors[channel].outputHigh = false;
  motors[channel].continuous = false;
  motors[channel].dutyPermille = 0;
  motors[channel].pulseEndMs = 0;
}

// -----------------------------------------------------------------------------

void stopAllMotors() {
  for (
    uint8_t channel = 0;
    channel < CHANNEL_COUNT;
    channel++
  ) {
    stopMotor(channel);
  }
}

// -----------------------------------------------------------------------------

void cancelRoutine() {
  routineMode = ROUTINE_NONE;

  routineWaitingGap = false;

  routineNextActionMs = 0;
}

// -----------------------------------------------------------------------------

void allOff() {
  cancelRoutine();

  stopAllMotors();
}

// -----------------------------------------------------------------------------

bool deadlineReached(
  unsigned long now,
  unsigned long deadline
) {
  return (long)(now - deadline) >= 0;
}

// -----------------------------------------------------------------------------

bool anyMotorActive() {
  for (
    uint8_t channel = 0;
    channel < CHANNEL_COUNT;
    channel++
  ) {
    if (motors[channel].active) {
      return true;
    }
  }

  return false;
}

// -----------------------------------------------------------------------------

bool anyContinuousMotor() {
  for (
    uint8_t channel = 0;
    channel < CHANNEL_COUNT;
    channel++
  ) {
    if (
      motors[channel].active &&
      motors[channel].continuous
    ) {
      return true;
    }
  }

  return false;
}

// =============================================================================
// [L150] NORMAL TIMED MOTOR PULSE
// =============================================================================

void beginPulse(
  uint8_t channel,
  uint16_t dutyPermille,
  unsigned long requestedDurationMs
) {
  const unsigned long durationMs =
    min(
      requestedDurationMs,
      MAX_PULSE_DURATION_MS
    );

  writeMotorPinsLow(channel);

  motors[channel].active =
    dutyPermille > 0;

  motors[channel].outputHigh =
    false;

  motors[channel].continuous =
    false;

  motors[channel].dutyPermille =
    dutyPermille;

  motors[channel].pulseEndMs =
    millis() + durationMs;

  motors[channel].pwmCycleStartUs =
    micros();
}

// =============================================================================
// NORMAL SONG MOTOR CONTROL
// =============================================================================
//
// Uses:
//
// calibrated motor power
// ×
// musical strength
//

void startMotorPulseCalibrated(
  uint8_t channel,
  unsigned long durationMs,
  uint16_t strength
) {
  const uint16_t calibratedDutyPermille =
    (uint16_t)motorPowerPercent[channel] * 10U;

  const uint16_t dutyPermille =
    (uint32_t)calibratedDutyPermille *
    strength /
    1000UL;

  beginPulse(
    channel,
    dutyPermille,
    durationMs
  );
}

// =============================================================================
// RAW CALIBRATION PULSE
// =============================================================================

void startMotorPulseRawPercent(
  uint8_t channel,
  uint8_t powerPercent,
  unsigned long durationMs
) {
  beginPulse(
    channel,
    (uint16_t)powerPercent * 10U,
    durationMs
  );
}

// =============================================================================
// [L172] CONTINUOUS MOTOR CONTROL
// =============================================================================
//
// Continuous mode intentionally ignores:
// MAX_PULSE_DURATION_MS
//
// Motor remains active until:
//
// STOP
// ALL_OFF
// DISARM
// ESTOP
//

void startMotorContinuousRawPercent(
  uint8_t channel,
  uint8_t powerPercent
) {
  writeMotorPinsLow(channel);

  motors[channel].active =
    powerPercent > 0;

  motors[channel].outputHigh =
    false;

  motors[channel].continuous =
    true;

  motors[channel].dutyPermille =
    (uint16_t)powerPercent * 10U;

  motors[channel].pulseEndMs =
    0;

  motors[channel].pwmCycleStartUs =
    micros();
}

// =============================================================================
// [L195] TIMED MOTOR EXPIRY
// =============================================================================
//
// Continuous motors are intentionally excluded.
//

void updateMotorPulseExpiry() {
  const unsigned long nowMs =
    millis();

  for (
    uint8_t channel = 0;
    channel < CHANNEL_COUNT;
    channel++
  ) {
    if (
      motors[channel].active &&
      !motors[channel].continuous &&
      deadlineReached(
        nowMs,
        motors[channel].pulseEndMs
      )
    ) {
      stopMotor(channel);
    }
  }
}

// =============================================================================
// SOFTWARE PWM
// =============================================================================

void updateSoftwarePwm() {
  const unsigned long nowUs =
    micros();

  for (
    uint8_t channel = 0;
    channel < CHANNEL_COUNT;
    channel++
  ) {
    MotorState &motor =
      motors[channel];

    if (!motor.active) {
      continue;
    }

    unsigned long phaseUs =
      nowUs -
      motor.pwmCycleStartUs;

    if (
      phaseUs >=
      PWM_PERIOD_US
    ) {
      motor.pwmCycleStartUs +=
        (phaseUs / PWM_PERIOD_US) *
        PWM_PERIOD_US;

      phaseUs %=
        PWM_PERIOD_US;
    }

    const unsigned long onTimeUs =
      (unsigned long)PWM_PERIOD_US *
      motor.dutyPermille /
      1000UL;

    const bool shouldBeHigh =
      phaseUs < onTimeUs;

    if (
      shouldBeHigh !=
      motor.outputHigh
    ) {
      digitalWrite(
        IN1_PINS[channel],
        shouldBeHigh
          ? HIGH
          : LOW
      );

      motor.outputHigh =
        shouldBeHigh;
    }
  }
}

// =============================================================================
// DISARM SAFETY
// =============================================================================

void enforceDisarmedState() {
  if (armed) {
    return;
  }

  calibrationMode = false;

  cancelRoutine();

  for (
    uint8_t channel = 0;
    channel < CHANNEL_COUNT;
    channel++
  ) {
    if (
      motors[channel].active ||
      motors[channel].outputHigh
    ) {
      stopMotor(channel);
    }
  }
}

// =============================================================================
// [L260] PARSING
// =============================================================================

uint8_t countCommas(
  const char *text
) {
  uint8_t count = 0;

  while (*text != '\0') {
    if (*text == ',') {
      count++;
    }

    text++;
  }

  return count;
}

// -----------------------------------------------------------------------------

bool parseLongInRange(
  const char *text,
  long minimum,
  long maximum,
  long &result
) {
  if (
    text == NULL ||
    *text == '\0'
  ) {
    return false;
  }

  for (
    const char *cursor = text;
    *cursor != '\0';
    cursor++
  ) {
    if (
      *cursor < '0' ||
      *cursor > '9'
    ) {
      return false;
    }
  }

  char *end = NULL;

  const long parsed =
    strtol(
      text,
      &end,
      10
    );

  if (
    end == text ||
    *end != '\0' ||
    parsed < minimum ||
    parsed > maximum
  ) {
    return false;
  }

  result = parsed;

  return true;
}

// -----------------------------------------------------------------------------

bool requireArmed() {
  if (!armed) {
    Serial.println(
      F("ERROR,NOT_ARMED")
    );

    return false;
  }

  return true;
}

// -----------------------------------------------------------------------------

bool requireCalibrationMode() {
  if (!calibrationMode) {
    Serial.println(
      F("ERROR,NOT_IN_CALIBRATION_MODE")
    );

    return false;
  }

  return true;
}

// =============================================================================
// [L330] CALIBRATION REPORTING
// =============================================================================

void printCalibration(
  uint8_t channel
) {
  Serial.print(
    F("CAL,")
  );

  Serial.print(channel);

  Serial.print(',');

  Serial.print(
    NOTE_LABELS[channel]
  );

  Serial.print(
    F(",ANGKLUNG=")
  );

  Serial.print(
    PHYSICAL_ANGKLUNG_NUMBERS[channel]
  );

  Serial.print(
    F(",POWER=")
  );

  Serial.print(
    motorPowerPercent[channel]
  );

  Serial.print(
    F(",PULSE=")
  );

  Serial.print(
    motorPulseMs[channel]
  );

  Serial.print(
    F(",IN1=")
  );

  Serial.print(
    IN1_PINS[channel]
  );

  Serial.print(
    F(",IN2=")
  );

  Serial.println(
    IN2_PINS[channel]
  );
}

// -----------------------------------------------------------------------------

void printCalibrationExport() {
  Serial.println(
    F("CALEXPORT,BEGIN")
  );

  for (
    uint8_t channel = 0;
    channel < CHANNEL_COUNT;
    channel++
  ) {
    Serial.print(
      F("CALEXPORT,")
    );

    Serial.print(channel);

    Serial.print(',');

    Serial.print(
      NOTE_LABELS[channel]
    );

    Serial.print(
      F(",POWER=")
    );

    Serial.print(
      motorPowerPercent[channel]
    );

    Serial.print(
      F(",PULSE=")
    );

    Serial.print(
      motorPulseMs[channel]
    );

    Serial.print(
      F(",IN1=")
    );

    Serial.print(
      IN1_PINS[channel]
    );

    Serial.print(
      F(",IN2=")
    );

    Serial.println(
      IN2_PINS[channel]
    );
  }

  Serial.println(
    F("CALEXPORT,END")
  );
}

// =============================================================================
// [L400] SWEEP ROUTINES
// =============================================================================

void printSweepStep(
  uint8_t channel,
  uint8_t powerPercent,
  uint16_t pulseMs
) {
  Serial.print(
    F("SWEEP,CHANNEL=")
  );

  Serial.print(channel);

  Serial.print(
    F(",NOTE=")
  );

  Serial.print(
    NOTE_LABELS[channel]
  );

  Serial.print(
    F(",ANGKLUNG=")
  );

  Serial.print(
    PHYSICAL_ANGKLUNG_NUMBERS[channel]
  );

  Serial.print(
    F(",POWER=")
  );

  Serial.print(
    powerPercent
  );

  Serial.print(
    F(",PULSE=")
  );

  Serial.println(
    pulseMs
  );
}

// -----------------------------------------------------------------------------

void startCurrentNoteSweepStep() {
  const uint8_t powerPercent =
    sweepUseFixedPower
      ? sweepPowerPercent
      : motorPowerPercent[routineChannel];

  const uint16_t pulseMs =
    sweepUseFixedPower
      ? sweepPulseMs
      : motorPulseMs[routineChannel];

  printSweepStep(
    routineChannel,
    powerPercent,
    pulseMs
  );

  startMotorPulseRawPercent(
    routineChannel,
    powerPercent,
    pulseMs
  );
}

// -----------------------------------------------------------------------------

void startCurrentCalSweepStep() {
  Serial.print(
    F("CALSWEEP,CHANNEL=")
  );

  Serial.print(
    routineChannel
  );

  Serial.print(
    F(",NOTE=")
  );

  Serial.print(
    NOTE_LABELS[routineChannel]
  );

  Serial.print(
    F(",POWER=")
  );

  Serial.print(
    calSweepCurrentPower
  );

  Serial.print(
    F(",PULSE=")
  );

  Serial.println(
    calSweepPulseMs
  );

  startMotorPulseRawPercent(
    routineChannel,
    calSweepCurrentPower,
    calSweepPulseMs
  );
}

// -----------------------------------------------------------------------------

void updateRoutine() {
  if (
    routineMode ==
    ROUTINE_NONE
  ) {
    return;
  }

  if (anyMotorActive()) {
    return;
  }

  const unsigned long nowMs =
    millis();

  if (!routineWaitingGap) {
    if (
      routineMode ==
      ROUTINE_NOTE_SWEEP &&
      routineChannel >=
      CHANNEL_COUNT - 1
    ) {
      cancelRoutine();

      Serial.println(
        F("ACK,SWEEP,DONE")
      );

      return;
    }

    if (
      routineMode ==
      ROUTINE_CAL_SWEEP &&
      (
        (uint16_t)calSweepCurrentPower +
        calSweepStepPower
      ) >
      calSweepEndPower
    ) {
      cancelRoutine();

      Serial.println(
        F("ACK,CALSWEEP,DONE")
      );

      return;
    }

    routineWaitingGap = true;

    routineNextActionMs =
      nowMs +
      routineGapMs;

    return;
  }

  if (
    !deadlineReached(
      nowMs,
      routineNextActionMs
    )
  ) {
    return;
  }

  routineWaitingGap = false;

  if (
    routineMode ==
    ROUTINE_NOTE_SWEEP
  ) {
    routineChannel++;

    startCurrentNoteSweepStep();

    return;
  }

  if (
    routineMode ==
    ROUTINE_CAL_SWEEP
  ) {
    calSweepCurrentPower +=
      calSweepStepPower;

    startCurrentCalSweepStep();

    return;
  }
}

// =============================================================================
// [L500] NORMAL WEB NOTE
// =============================================================================
//
// NOTE,<channel>,<duration>,<strength>
//
// Example:
//
// NOTE,10,500,800
//

void handleNoteCommand(
  char *command
) {
  if (
    countCommas(command) != 3
  ) {
    Serial.println(
      F("ERROR,INVALID_NOTE")
    );

    return;
  }

  if (!requireArmed()) {
    return;
  }

  if (calibrationMode) {
    Serial.println(
      F("ERROR,CALIBRATION_MODE_ACTIVE")
    );

    return;
  }

  char *channelText =
    strtok(
      command + 5,
      ","
    );

  char *durationText =
    strtok(
      NULL,
      ","
    );

  char *strengthText =
    strtok(
      NULL,
      ","
    );

  long channel;
  long durationMs;
  long strength;

  if (
    !parseLongInRange(
      channelText,
      0,
      CHANNEL_COUNT - 1,
      channel
    )
  ) {
    Serial.println(
      F("ERROR,INVALID_CHANNEL")
    );

    return;
  }

  if (
    !parseLongInRange(
      durationText,
      1,
      MAX_REQUESTED_DURATION_MS,
      durationMs
    )
  ) {
    Serial.println(
      F("ERROR,INVALID_DURATION")
    );

    return;
  }

  if (
    !parseLongInRange(
      strengthText,
      0,
      1000,
      strength
    )
  ) {
    Serial.println(
      F("ERROR,INVALID_STRENGTH")
    );

    return;
  }

  cancelRoutine();

  startMotorPulseCalibrated(
    (uint8_t)channel,
    (unsigned long)durationMs,
    (uint16_t)strength
  );

  Serial.print(
    F("ACK,NOTE,")
  );

  Serial.println(channel);
}

// =============================================================================
// TEST
// =============================================================================
//
// TEST,<channel>
//
// Uses stored calibration.
//
// TEST,<channel>,<power>,<duration>
//
// Uses exact raw power.
//

void handleTestCommand(
  char *command
) {
  if (
    !requireArmed() ||
    !requireCalibrationMode()
  ) {
    return;
  }

  const uint8_t commaCount =
    countCommas(command);

  // ---------------------------------------------------------------------------
  // TEST,<channel>
  // ---------------------------------------------------------------------------

  if (commaCount == 1) {
    long channel;

    if (
      !parseLongInRange(
        command + 5,
        0,
        CHANNEL_COUNT - 1,
        channel
      )
    ) {
      Serial.println(
        F("ERROR,INVALID_CHANNEL")
      );

      return;
    }

    allOff();

    startMotorPulseRawPercent(
      (uint8_t)channel,
      motorPowerPercent[channel],
      motorPulseMs[channel]
    );

    Serial.print(
      F("ACK,TEST,")
    );

    Serial.print(channel);

    Serial.print(
      F(",NOTE=")
    );

    Serial.print(
      NOTE_LABELS[channel]
    );

    Serial.print(
      F(",POWER=")
    );

    Serial.print(
      motorPowerPercent[channel]
    );

    Serial.print(
      F(",PULSE=")
    );

    Serial.println(
      motorPulseMs[channel]
    );

    return;
  }

  // ---------------------------------------------------------------------------
  // TEST,<channel>,<power>,<duration>
  // ---------------------------------------------------------------------------

  if (commaCount == 3) {
    char *channelText =
      strtok(
        command + 5,
        ","
      );

    char *powerText =
      strtok(
        NULL,
        ","
      );

    char *durationText =
      strtok(
        NULL,
        ","
      );

    long channel;
    long powerPercent;
    long durationMs;

    if (
      !parseLongInRange(
        channelText,
        0,
        CHANNEL_COUNT - 1,
        channel
      )
    ) {
      Serial.println(
        F("ERROR,INVALID_CHANNEL")
      );

      return;
    }

    if (
      !parseLongInRange(
        powerText,
        0,
        MAX_CALIBRATION_POWER_PERCENT,
        powerPercent
      )
    ) {
      Serial.println(
        F("ERROR,INVALID_POWER")
      );

      return;
    }

    if (
      !parseLongInRange(
        durationText,
        MIN_CALIBRATION_PULSE_MS,
        MAX_PULSE_DURATION_MS,
        durationMs
      )
    ) {
      Serial.println(
        F("ERROR,INVALID_DURATION")
      );

      return;
    }

    allOff();

    startMotorPulseRawPercent(
      (uint8_t)channel,
      (uint8_t)powerPercent,
      (unsigned long)durationMs
    );

    Serial.print(
      F("ACK,TEST,")
    );

    Serial.print(channel);

    Serial.print(
      F(",NOTE=")
    );

    Serial.print(
      NOTE_LABELS[channel]
    );

    Serial.print(
      F(",POWER=")
    );

    Serial.print(
      powerPercent
    );

    Serial.print(
      F(",PULSE=")
    );

    Serial.println(
      durationMs
    );

    return;
  }

  Serial.println(
    F("ERROR,INVALID_TEST")
  );
}

// =============================================================================
// [L548] ALL MOTORS - TIMED
// =============================================================================
//
// ALL,<duration>
//
// Example:
//
// ALL,300
//
// Uses individual motorPowerPercent[].
//
// -----------------------------------------------------------------------------
//
// ALL,<power>,<duration>
//
// Example:
//
// ALL,20,300
//
// Runs all motors at exactly 20% for 300 ms.
//

void handleAllCommand(
  char *command
) {
  if (
    !requireArmed() ||
    !requireCalibrationMode()
  ) {
    return;
  }

  const uint8_t commaCount =
    countCommas(command);

  // ---------------------------------------------------------------------------
  // ALL,<duration>
  // ---------------------------------------------------------------------------

  if (commaCount == 1) {
    long durationMs;

    if (
      !parseLongInRange(
        command + 4,
        MIN_CALIBRATION_PULSE_MS,
        MAX_PULSE_DURATION_MS,
        durationMs
      )
    ) {
      Serial.println(
        F("ERROR,INVALID_DURATION")
      );

      return;
    }

    allOff();

    for (
      uint8_t channel = 0;
      channel < CHANNEL_COUNT;
      channel++
    ) {
      startMotorPulseRawPercent(
        channel,
        motorPowerPercent[channel],
        (unsigned long)durationMs
      );
    }

    Serial.print(
      F("ACK,ALL,PROFILE,DURATION=")
    );

    Serial.println(
      durationMs
    );

    return;
  }

  // ---------------------------------------------------------------------------
  // ALL,<power>,<duration>
  // ---------------------------------------------------------------------------

  if (commaCount == 2) {
    char *powerText =
      strtok(
        command + 4,
        ","
      );

    char *durationText =
      strtok(
        NULL,
        ","
      );

    long powerPercent;
    long durationMs;

    if (
      !parseLongInRange(
        powerText,
        0,
        MAX_CALIBRATION_POWER_PERCENT,
        powerPercent
      )
    ) {
      Serial.println(
        F("ERROR,INVALID_POWER")
      );

      return;
    }

    if (
      !parseLongInRange(
        durationText,
        MIN_CALIBRATION_PULSE_MS,
        MAX_PULSE_DURATION_MS,
        durationMs
      )
    ) {
      Serial.println(
        F("ERROR,INVALID_DURATION")
      );

      return;
    }

    allOff();

    for (
      uint8_t channel = 0;
      channel < CHANNEL_COUNT;
      channel++
    ) {
      startMotorPulseRawPercent(
        channel,
        (uint8_t)powerPercent,
        (unsigned long)durationMs
      );
    }

    Serial.print(
      F("ACK,ALL,POWER=")
    );

    Serial.print(
      powerPercent
    );

    Serial.print(
      F(",DURATION=")
    );

    Serial.println(
      durationMs
    );

    return;
  }

  Serial.println(
    F("ERROR,INVALID_ALL")
  );
}

// =============================================================================
// [L638] ALL MOTORS - CONTINUOUS
// =============================================================================
//
// ALLON
//
// Uses each motor's individual motorPowerPercent[].
//
// -----------------------------------------------------------------------------
//
// ALLON,<power>
//
// Example:
//
// ALLON,20
//
// Runs all 18 motors continuously at exactly 20%.
//
// THERE IS NO TIME LIMIT.
//
// Stop with:
//
// STOP
// ALL_OFF
// DISARM
// ESTOP
//

void handleAllOnCommand(
  char *command
) {
  if (
    !requireArmed() ||
    !requireCalibrationMode()
  ) {
    return;
  }

  // ---------------------------------------------------------------------------
  // ALLON
  // ---------------------------------------------------------------------------

  if (
    strcmp(
      command,
      "ALLON"
    ) == 0
  ) {
    allOff();

    for (
      uint8_t channel = 0;
      channel < CHANNEL_COUNT;
      channel++
    ) {
      startMotorContinuousRawPercent(
        channel,
        motorPowerPercent[channel]
      );
    }

    Serial.println(
      F("ACK,ALLON,PROFILE")
    );

    return;
  }

  // ---------------------------------------------------------------------------
  // ALLON,<power>
  // ---------------------------------------------------------------------------

  if (
    countCommas(command) == 1
  ) {
    long powerPercent;

    if (
      !parseLongInRange(
        command + 6,
        0,
        MAX_CALIBRATION_POWER_PERCENT,
        powerPercent
      )
    ) {
      Serial.println(
        F("ERROR,INVALID_POWER")
      );

      return;
    }

    allOff();

    for (
      uint8_t channel = 0;
      channel < CHANNEL_COUNT;
      channel++
    ) {
      startMotorContinuousRawPercent(
        channel,
        (uint8_t)powerPercent
      );
    }

    Serial.print(
      F("ACK,ALLON,POWER=")
    );

    Serial.println(
      powerPercent
    );

    return;
  }

  Serial.println(
    F("ERROR,INVALID_ALLON")
  );
}

// =============================================================================
// [L710] FULL RACK SWEEP
// =============================================================================
//
// SWEEP
//
// Uses each stored motor calibration.
//
// -----------------------------------------------------------------------------
//
// SWEEP,<power>,<duration>,<gap>
//
// Example:
//
// SWEEP,30,400,300
//

void handleSweepCommand(
  char *command
) {
  if (
    !requireArmed() ||
    !requireCalibrationMode()
  ) {
    return;
  }

  allOff();

  if (
    strcmp(
      command,
      "SWEEP"
    ) == 0
  ) {
    sweepUseFixedPower =
      false;

    routineGapMs =
      DEFAULT_SWEEP_GAP_MS;
  }

  else {
    if (
      countCommas(command) != 3
    ) {
      Serial.println(
        F("ERROR,INVALID_SWEEP")
      );

      return;
    }

    char *powerText =
      strtok(
        command + 6,
        ","
      );

    char *durationText =
      strtok(
        NULL,
        ","
      );

    char *gapText =
      strtok(
        NULL,
        ","
      );

    long powerPercent;
    long durationMs;
    long gapMs;

    if (
      !parseLongInRange(
        powerText,
        0,
        MAX_CALIBRATION_POWER_PERCENT,
        powerPercent
      )
    ) {
      Serial.println(
        F("ERROR,INVALID_POWER")
      );

      return;
    }

    if (
      !parseLongInRange(
        durationText,
        MIN_CALIBRATION_PULSE_MS,
        MAX_PULSE_DURATION_MS,
        durationMs
      )
    ) {
      Serial.println(
        F("ERROR,INVALID_DURATION")
      );

      return;
    }

    if (
      !parseLongInRange(
        gapText,
        MIN_SWEEP_GAP_MS,
        MAX_SWEEP_GAP_MS,
        gapMs
      )
    ) {
      Serial.println(
        F("ERROR,INVALID_GAP")
      );

      return;
    }

    sweepUseFixedPower =
      true;

    sweepPowerPercent =
      (uint8_t)powerPercent;

    sweepPulseMs =
      (uint16_t)durationMs;

    routineGapMs =
      (uint16_t)gapMs;
  }

  routineMode =
    ROUTINE_NOTE_SWEEP;

  routineChannel = 0;

  routineWaitingGap =
    false;

  Serial.println(
    F("ACK,SWEEP,START")
  );

  startCurrentNoteSweepStep();
}

// =============================================================================
// [L800] CALIBRATION POWER SWEEP
// =============================================================================
//
// CALSWEEP,<channel>,<start>,<end>,<step>,<duration>,<gap>
//
// Example:
//
// CALSWEEP,10,20,60,5,500,500
//

void handleCalSweepCommand(
  char *command
) {
  if (
    !requireArmed() ||
    !requireCalibrationMode()
  ) {
    return;
  }

  if (
    countCommas(command) != 6
  ) {
    Serial.println(
      F("ERROR,INVALID_CALSWEEP")
    );

    return;
  }

  char *channelText =
    strtok(
      command + 9,
      ","
    );

  char *startText =
    strtok(
      NULL,
      ","
    );

  char *endText =
    strtok(
      NULL,
      ","
    );

  char *stepText =
    strtok(
      NULL,
      ","
    );

  char *durationText =
    strtok(
      NULL,
      ","
    );

  char *gapText =
    strtok(
      NULL,
      ","
    );

  long channel;
  long startPower;
  long endPower;
  long stepPower;
  long durationMs;
  long gapMs;

  if (
    !parseLongInRange(
      channelText,
      0,
      CHANNEL_COUNT - 1,
      channel
    )
  ) {
    Serial.println(
      F("ERROR,INVALID_CHANNEL")
    );

    return;
  }

  if (
    !parseLongInRange(
      startText,
      0,
      MAX_CALIBRATION_POWER_PERCENT,
      startPower
    )
  ) {
    Serial.println(
      F("ERROR,INVALID_START_POWER")
    );

    return;
  }

  if (
    !parseLongInRange(
      endText,
      0,
      MAX_CALIBRATION_POWER_PERCENT,
      endPower
    )
  ) {
    Serial.println(
      F("ERROR,INVALID_END_POWER")
    );

    return;
  }

  if (
    !parseLongInRange(
      stepText,
      1,
      MAX_CALIBRATION_POWER_PERCENT,
      stepPower
    )
  ) {
    Serial.println(
      F("ERROR,INVALID_STEP")
    );

    return;
  }

  if (
    !parseLongInRange(
      durationText,
      MIN_CALIBRATION_PULSE_MS,
      MAX_PULSE_DURATION_MS,
      durationMs
    )
  ) {
    Serial.println(
      F("ERROR,INVALID_DURATION")
    );

    return;
  }

  if (
    !parseLongInRange(
      gapText,
      MIN_SWEEP_GAP_MS,
      MAX_SWEEP_GAP_MS,
      gapMs
    )
  ) {
    Serial.println(
      F("ERROR,INVALID_GAP")
    );

    return;
  }

  if (
    startPower >
    endPower
  ) {
    Serial.println(
      F("ERROR,START_POWER_GT_END_POWER")
    );

    return;
  }

  allOff();

  routineMode =
    ROUTINE_CAL_SWEEP;

  routineChannel =
    (uint8_t)channel;

  routineGapMs =
    (uint16_t)gapMs;

  routineWaitingGap =
    false;

  calSweepEndPower =
    (uint8_t)endPower;

  calSweepStepPower =
    (uint8_t)stepPower;

  calSweepCurrentPower =
    (uint8_t)startPower;

  calSweepPulseMs =
    (uint16_t)durationMs;

  Serial.print(
    F("ACK,CALSWEEP,START,CHANNEL=")
  );

  Serial.print(channel);

  Serial.print(
    F(",NOTE=")
  );

  Serial.println(
    NOTE_LABELS[channel]
  );

  startCurrentCalSweepStep();
}

// =============================================================================
// [L900] POWER
// =============================================================================
//
// POWER,<channel>,<0-60>
//

void handlePowerCommand(
  char *command
) {
  if (
    !requireArmed() ||
    !requireCalibrationMode()
  ) {
    return;
  }

  if (
    countCommas(command) != 2
  ) {
    Serial.println(
      F("ERROR,INVALID_POWER")
    );

    return;
  }

  char *channelText =
    strtok(
      command + 6,
      ","
    );

  char *percentText =
    strtok(
      NULL,
      ","
    );

  long channel;
  long percent;

  if (
    !parseLongInRange(
      channelText,
      0,
      CHANNEL_COUNT - 1,
      channel
    )
  ) {
    Serial.println(
      F("ERROR,INVALID_CHANNEL")
    );

    return;
  }

  if (
    !parseLongInRange(
      percentText,
      0,
      MAX_CALIBRATION_POWER_PERCENT,
      percent
    )
  ) {
    Serial.println(
      F("ERROR,INVALID_POWER")
    );

    return;
  }

  motorPowerPercent[channel] =
    (uint8_t)percent;

  Serial.print(
    F("ACK,POWER,")
  );

  Serial.print(channel);

  Serial.print(',');

  Serial.println(percent);
}

// =============================================================================
// PULSE
// =============================================================================
//
// PULSE,<channel>,<50-700>
//

void handlePulseCommand(
  char *command
) {
  if (
    !requireArmed() ||
    !requireCalibrationMode()
  ) {
    return;
  }

  if (
    countCommas(command) != 2
  ) {
    Serial.println(
      F("ERROR,INVALID_PULSE")
    );

    return;
  }

  char *channelText =
    strtok(
      command + 6,
      ","
    );

  char *pulseText =
    strtok(
      NULL,
      ","
    );

  long channel;
  long pulseMs;

  if (
    !parseLongInRange(
      channelText,
      0,
      CHANNEL_COUNT - 1,
      channel
    )
  ) {
    Serial.println(
      F("ERROR,INVALID_CHANNEL")
    );

    return;
  }

  if (
    !parseLongInRange(
      pulseText,
      MIN_CALIBRATION_PULSE_MS,
      MAX_PULSE_DURATION_MS,
      pulseMs
    )
  ) {
    Serial.println(
      F("ERROR,INVALID_PULSE")
    );

    return;
  }

  motorPulseMs[channel] =
    (uint16_t)pulseMs;

  Serial.print(
    F("ACK,PULSE,")
  );

  Serial.print(channel);

  Serial.print(',');

  Serial.println(pulseMs);
}

// =============================================================================
// CAL
// =============================================================================
//
// CAL,<channel>
//

void handleCalibrationCommand(
  char *command
) {
  if (
    countCommas(command) != 1
  ) {
    Serial.println(
      F("ERROR,INVALID_CAL")
    );

    return;
  }

  long channel;

  if (
    !parseLongInRange(
      command + 4,
      0,
      CHANNEL_COUNT - 1,
      channel
    )
  ) {
    Serial.println(
      F("ERROR,INVALID_CHANNEL")
    );

    return;
  }

  printCalibration(
    (uint8_t)channel
  );
}

// =============================================================================
// [L1000] MAIN COMMAND PARSER
// =============================================================================

void handleCommand(
  char *command
) {
  // Convert lowercase to uppercase.
  for (
    uint8_t index = 0;
    command[index] != '\0';
    index++
  ) {
    if (
      command[index] >= 'a' &&
      command[index] <= 'z'
    ) {
      command[index] -=
        ('a' - 'A');
    }
  }

  // ---------------------------------------------------------------------------
  // WEB SERIAL HANDSHAKE
  // ---------------------------------------------------------------------------

  if (
    strcmp(
      command,
      "HELLO,1"
    ) == 0
  ) {
    Serial.println(
      F("READY,1,ACTIVE")
    );

    return;
  }

  if (
    strncmp(
      command,
      "HELLO,",
      6
    ) == 0
  ) {
    Serial.println(
      F("ERROR,PROTOCOL_VERSION")
    );

    return;
  }

  // ---------------------------------------------------------------------------
  // NORMAL NOTE
  // ---------------------------------------------------------------------------

  if (
    strncmp(
      command,
      "NOTE,",
      5
    ) == 0
  ) {
    handleNoteCommand(
      command
    );

    return;
  }

  // ---------------------------------------------------------------------------
  // ARM
  // ---------------------------------------------------------------------------

  if (
    strcmp(
      command,
      "ARM"
    ) == 0
  ) {
    allOff();

    calibrationMode =
      false;

    armed =
      true;

    Serial.println(
      F("ACK,ARM")
    );

    return;
  }

  // ---------------------------------------------------------------------------
  // CALIBRATION MODE
  // ---------------------------------------------------------------------------

  if (
    strcmp(
      command,
      "CALIBRATE"
    ) == 0
  ) {
    if (!requireArmed()) {
      return;
    }

    allOff();

    calibrationMode =
      true;

    Serial.println(
      F("ACK,CALIBRATE,ENTER")
    );

    return;
  }

  // ---------------------------------------------------------------------------
  // EXIT CALIBRATION
  // ---------------------------------------------------------------------------

  if (
    strcmp(
      command,
      "CALDONE"
    ) == 0 ||
    strcmp(
      command,
      "EXITCAL"
    ) == 0
  ) {
    allOff();

    calibrationMode =
      false;

    Serial.println(
      F("ACK,CALIBRATE,EXIT")
    );

    return;
  }

  // ---------------------------------------------------------------------------
  // TEST
  // ---------------------------------------------------------------------------

  if (
    strncmp(
      command,
      "TEST,",
      5
    ) == 0
  ) {
    handleTestCommand(
      command
    );

    return;
  }

  // ---------------------------------------------------------------------------
  // [L1027] CONTINUOUS ALL MOTORS
  // ---------------------------------------------------------------------------

  if (
    strcmp(
      command,
      "ALLON"
    ) == 0 ||
    strncmp(
      command,
      "ALLON,",
      6
    ) == 0
  ) {
    handleAllOnCommand(
      command
    );

    return;
  }

  // ---------------------------------------------------------------------------
  // TIMED ALL MOTORS
  // ---------------------------------------------------------------------------

  if (
    strncmp(
      command,
      "ALL,",
      4
    ) == 0
  ) {
    handleAllCommand(
      command
    );

    return;
  }

  // ---------------------------------------------------------------------------
  // SWEEP
  // ---------------------------------------------------------------------------

  if (
    strcmp(
      command,
      "SWEEP"
    ) == 0 ||
    strncmp(
      command,
      "SWEEP,",
      6
    ) == 0
  ) {
    handleSweepCommand(
      command
    );

    return;
  }

  // ---------------------------------------------------------------------------
  // CALSWEEP
  // ---------------------------------------------------------------------------

  if (
    strncmp(
      command,
      "CALSWEEP,",
      9
    ) == 0
  ) {
    handleCalSweepCommand(
      command
    );

    return;
  }

  // ---------------------------------------------------------------------------
  // POWER
  // ---------------------------------------------------------------------------

  if (
    strncmp(
      command,
      "POWER,",
      6
    ) == 0
  ) {
    handlePowerCommand(
      command
    );

    return;
  }

  // ---------------------------------------------------------------------------
  // PULSE
  // ---------------------------------------------------------------------------

  if (
    strncmp(
      command,
      "PULSE,",
      6
    ) == 0
  ) {
    handlePulseCommand(
      command
    );

    return;
  }

  // ---------------------------------------------------------------------------
  // CAL
  // ---------------------------------------------------------------------------

  if (
    strncmp(
      command,
      "CAL,",
      4
    ) == 0
  ) {
    handleCalibrationCommand(
      command
    );

    return;
  }

  // ---------------------------------------------------------------------------
  // CALALL
  // ---------------------------------------------------------------------------

  if (
    strcmp(
      command,
      "CALALL"
    ) == 0
  ) {
    allOff();

    for (
      uint8_t channel = 0;
      channel < CHANNEL_COUNT;
      channel++
    ) {
      printCalibration(channel);
    }

    Serial.println(
      F("ACK,CALALL,DONE")
    );

    return;
  }

  // ---------------------------------------------------------------------------
  // CALEXPORT
  // ---------------------------------------------------------------------------

  if (
    strcmp(
      command,
      "CALEXPORT"
    ) == 0
  ) {
    allOff();

    printCalibrationExport();

    return;
  }

  // ---------------------------------------------------------------------------
  // STOP
  // ---------------------------------------------------------------------------

  if (
    strcmp(
      command,
      "STOP"
    ) == 0 ||
    strcmp(
      command,
      "ALL_OFF"
    ) == 0
  ) {
    allOff();

    Serial.println(
      F("ACK,ALL_OFF")
    );

    return;
  }

  // ---------------------------------------------------------------------------
  // DISARM / ESTOP
  // ---------------------------------------------------------------------------

  if (
    strcmp(
      command,
      "DISARM"
    ) == 0 ||
    strcmp(
      command,
      "ESTOP"
    ) == 0
  ) {
    armed = false;

    calibrationMode =
      false;

    allOff();

    Serial.println(
      F("ACK,DISARM")
    );

    return;
  }

  // ---------------------------------------------------------------------------
  // STATUS
  // ---------------------------------------------------------------------------

  if (
    strcmp(
      command,
      "STATUS"
    ) == 0
  ) {
    Serial.print(
      F("STATUS,READY,PROTOCOL=")
    );

    Serial.print(
      PROTOCOL_VERSION
    );

    Serial.print(
      F(",MODE=")
    );

    Serial.print(
      calibrationMode
        ? F("CALIBRATION")
        : F("NORMAL")
    );

    Serial.print(
      F(",ARMED=")
    );

    Serial.print(
      armed
        ? F("TRUE")
        : F("FALSE")
    );

    Serial.print(
      F(",CONTINUOUS=")
    );

    Serial.print(
      anyContinuousMotor()
        ? F("TRUE")
        : F("FALSE")
    );

    Serial.print(
      F(",ROUTINE=")
    );

    if (
      routineMode ==
      ROUTINE_NOTE_SWEEP
    ) {
      Serial.println(
        F("SWEEP")
      );
    }

    else if (
      routineMode ==
      ROUTINE_CAL_SWEEP
    ) {
      Serial.println(
        F("CALSWEEP")
      );
    }

    else {
      Serial.println(
        F("NONE")
      );
    }

    return;
  }

  Serial.println(
    F("ERROR,UNKNOWN_COMMAND")
  );
}

// =============================================================================
// [L1160] SERIAL READER
// =============================================================================

void readSerial() {
  uint8_t bytesRead = 0;

  while (
    Serial.available() > 0 &&
    bytesRead <
    MAX_SERIAL_BYTES_PER_LOOP
  ) {
    const char incoming =
      Serial.read();

    bytesRead++;

    if (
      incoming == '\n' ||
      incoming == '\r'
    ) {
      if (
        !discardCommandUntilNewline &&
        commandLength > 0
      ) {
        commandBuffer[
          commandLength
        ] = '\0';

        handleCommand(
          commandBuffer
        );
      }

      commandLength = 0;

      discardCommandUntilNewline =
        false;

      continue;
    }

    if (
      discardCommandUntilNewline
    ) {
      continue;
    }

    if (
      commandLength <
      COMMAND_BUFFER_SIZE - 1
    ) {
      commandBuffer[
        commandLength++
      ] = incoming;
    }

    else {
      commandLength = 0;

      discardCommandUntilNewline =
        true;

      Serial.println(
        F("ERROR,COMMAND_TOO_LONG")
      );
    }
  }
}

// =============================================================================
// [L1210] SETUP
// =============================================================================

void setup() {
  armed = false;

  calibrationMode =
    false;

  cancelRoutine();

  for (
    uint8_t channel = 0;
    channel < CHANNEL_COUNT;
    channel++
  ) {
    digitalWrite(
      IN1_PINS[channel],
      LOW
    );

    digitalWrite(
      IN2_PINS[channel],
      LOW
    );

    pinMode(
      IN1_PINS[channel],
      OUTPUT
    );

    pinMode(
      IN2_PINS[channel],
      OUTPUT
    );

    stopMotor(channel);
  }

  Serial.begin(
    SERIAL_BAUD
  );

  Serial.println(
    F("ANGKLOBOT FULL 18 + CALIBRATION READY")
  );

  Serial.println(
    F("OUTPUTS DISARMED")
  );

  Serial.println(
    F("PIN MAP: G5=40/41, A5=38/39, B5=44/45, C6=42/43")
  );

  Serial.println(
    F("WARNING: ALLON HAS NO AUTOMATIC TIMEOUT")
  );

  // ===========================================================================
  // [L1230] COMMAND HELP
  // ===========================================================================

  Serial.println(
    F("Commands:")
  );

  Serial.println(
    F("ARM")
  );

  Serial.println(
    F("DISARM / ESTOP")
  );

  Serial.println(
    F("STOP / ALL_OFF")
  );

  Serial.println(
    F("STATUS")
  );

  Serial.println(
    F("NOTE,<channel>,<duration>,<strength>")
  );

  Serial.println(
    F("CALIBRATE")
  );

  Serial.println(
    F("CALDONE")
  );

  Serial.println(
    F("TEST,<channel>")
  );

  Serial.println(
    F("TEST,<channel>,<power>,<duration>")
  );

  Serial.println(
    F("ALL,<duration>")
  );

  Serial.println(
    F("ALL,<power>,<duration>")
  );

  Serial.println(
    F("ALLON")
  );

  Serial.println(
    F("ALLON,<power>")
  );

  Serial.println(
    F("SWEEP")
  );

  Serial.println(
    F("SWEEP,<power>,<duration>,<gap>")
  );

  Serial.println(
    F("CALSWEEP,<channel>,<start>,<end>,<step>,<duration>,<gap>")
  );

  Serial.println(
    F("POWER,<channel>,<0-60>")
  );

  Serial.println(
    F("PULSE,<channel>,<50-700>")
  );

  Serial.println(
    F("CAL,<channel>")
  );

  Serial.println(
    F("CALALL")
  );

  Serial.println(
    F("CALEXPORT")
  );
}

// =============================================================================
// [L1300] MAIN LOOP
// =============================================================================

void loop() {
  readSerial();

  updateMotorPulseExpiry();

  updateRoutine();

  updateSoftwarePwm();

  enforceDisarmedState();
}

/*
  INDONESIA PUSAKA — ANGKLOBOT
  Arduino Mega 2560 / 18 natural-note angklungs

  Source: the two supplied piano-score screenshots.
  Arrangement: melody-first, with one soft bass-support note per bar.
  The screenshots have no key signature: the melody is in C major.
  Chromatic passing tones are simplified explicitly in the note map.
  This is a practical sheet-based adaptation, not a transcription of
  every piano accompaniment note.

  Timing: source quarter = 65 BPM, changing to 66 at bar 29.
  Set TEMPO_PERCENT below to slow the entire performance proportionally.
  One score tick = one sixteenth note. All starts are absolute score times.
  Distinct repeated notes receive larger release gaps; ties are continuous.
  Long notes use an initial attack followed by quieter continuous PWM.

  IMPORTANT HARDWARE NOTE:
  The supplied wiring map uses pin 42 for both G5 IN2 and C6 IN1.
  This arrangement needs only channels 0-8. All other channels are locked
  off and their pins remain LOW. The startup validator rejects a song if
  any required channel shares a pin with any other driver. Do not remove
  this protection or enable G5/C6 until the wiring conflict is corrected.

  Software cannot suppress bootloader pin activity before setup().
  Use an independent motor-power disconnect / emergency stop.
  Sustained motor temperature, current, and stall behavior must be tested
  on the real mechanism; PWM percentage is not a measured RPM or volume.

  Serial: 115200 baud, Newline or Both NL & CR.
  ARM, PLAY, INDONESIAPUSAKA, PUSAKA, STOP, DISARM, ESTOP, STATUS.
  No autoplay. ARM must precede playback.
*/

#include <Arduino.h>
#include <avr/pgmspace.h>
#include <string.h>
#include <stdlib.h>

constexpr uint8_t CHANNEL_COUNT = 18;
constexpr uint16_t PWM_PERIOD_US = 1000;
constexpr unsigned long SERIAL_BAUD = 115200;
constexpr uint16_t SCORE_BPM = 65;
constexpr uint16_t FINAL_SECTION_BPM = 66;
constexpr uint16_t TEMPO_PERCENT = 100;
constexpr uint16_t TICKS_PER_QUARTER = 4;
constexpr uint16_t FINAL_SECTION_TICK = 452; // bar 29
constexpr uint16_t SONG_END_TICK = 516;
constexpr unsigned long MANUAL_START_DELAY_MS = 2000;

// Musical release gaps: start times NEVER move.
constexpr uint16_t SHORT_RELEASE_GAP_MS = 35;
constexpr uint16_t MEDIUM_RELEASE_GAP_MS = 45;
constexpr uint16_t LONG_RELEASE_GAP_MS = 55;
constexpr uint16_t REPEATED_SHORT_GAP_MS = 90;
constexpr uint16_t REPEATED_MEDIUM_GAP_MS = 110;
constexpr uint16_t REPEATED_LONG_GAP_MS = 130;
constexpr uint16_t TIED_RELEASE_GAP_MS = 0;

// Attack / sustain envelope.
constexpr uint16_t SHORT_NOTE_THRESHOLD_MS = 450;
constexpr uint16_t MEDIUM_NOTE_THRESHOLD_MS = 1100;
constexpr uint16_t ATTACK_MS_MEDIUM = 100;
constexpr uint16_t ATTACK_MS_LONG = 125;
constexpr uint16_t MAX_NOTE_HOLD_MS = 4000;
constexpr uint16_t MAX_SUPPORT_HOLD_MS = 900;
constexpr uint8_t MAX_OUTPUT_POWER_PERCENT = 42;
constexpr uint8_t MIN_MELODY_SUSTAIN_PERCENT = 18;
constexpr uint8_t MIN_SUPPORT_SUSTAIN_PERCENT = 12;
constexpr uint8_t ROLE_MELODY = 0;
constexpr uint8_t ROLE_SUPPORT = 1;
constexpr uint8_t MAX_SIMULTANEOUS_MOTORS = 3;

// Channel order: G3 A3 B3 C4 D4 E4 F4 G4 A4 B4 C5 D5 E5 F5 G5 A5 B5 C6
const uint8_t IN1_PINS[CHANNEL_COUNT] = {
  6, 8, 2, 4, 28, 26, 32, 30, 12,
  10, 24, 22, 36, 34, 41, 38, 44, 42
};
const uint8_t IN2_PINS[CHANNEL_COUNT] = {
  7, 9, 3, 5, 29, 27, 33, 31, 14,
  11, 25, 23, 37, 35, 42, 39, 45, 43
};

// Preserved quieter per-motor calibration.
uint8_t motorPowerPercent[CHANNEL_COUNT] = {
  35, 30, 25, 30, 30, 30, 30, 35, 30,
  25, 30, 30, 30, 30, 35, 30, 25, 30
};

// Only these physical angklungs are used by this song.
// Disabled drivers are never given a HIGH output.
const uint8_t CHANNEL_ENABLED[CHANNEL_COUNT] = {
  1, 1, 1, 1, 1, 1, 1, 1, 1,
  0, 0, 0, 0, 0, 0, 0, 0, 0
};

struct __attribute__((packed)) SongEvent {
  uint16_t startTick;
  uint16_t durationTicks;
  uint16_t nextSameTick;  // 65535 means no later event on this channel
  uint8_t channel;
  uint8_t role;
};

const SongEvent SONG[] PROGMEM = {
  {0, 2, 12, 0, 0},
  {2, 2, 4, 3, 0},
  {4, 6, 16, 5, 0},
  {4, 5, 14, 3, 1},
  {10, 2, 34, 4, 0},
  {12, 2, 30, 0, 0},
  {14, 2, 20, 3, 0},
  {16, 2, 50, 5, 0},
  {18, 2, 92, 8, 0},
  {20, 8, 108, 7, 0},
  {20, 5, 32, 3, 1},
  {30, 2, 52, 0, 0},
  {32, 2, 36, 3, 0},
  {34, 2, 52, 4, 0},
  {36, 6, 44, 3, 0},
  {36, 5, 82, 1, 1},
  {42, 2, 46, 2, 0},
  {44, 2, 48, 3, 0},
  {46, 2, 80, 2, 0},
  {48, 2, 56, 3, 0},
  {50, 2, 68, 5, 0},
  {52, 4, 74, 4, 0},
  {52, 5, 64, 0, 1},
  {56, 8, 66, 3, 0},
  {64, 2, 76, 0, 0},
  {66, 2, 68, 3, 0},
  {68, 6, 128, 5, 0},
  {68, 5, 78, 3, 1},
  {74, 2, 98, 4, 0},
  {76, 2, 84, 0, 0},
  {78, 2, 100, 3, 0},
  {80, 2, 146, 2, 0},
  {82, 2, 116, 1, 0},
  {84, 8, 100, 0, 0},
  {84, 5, 96, 6, 1},
  {92, 4, 106, 8, 0},
  {96, 2, 130, 6, 0},
  {98, 2, 144, 4, 0},
  {100, 6, 116, 3, 0},
  {100, 5, 114, 0, 1},
  {106, 2, 110, 8, 0},
  {108, 2, 112, 7, 0},
  {110, 2, 138, 8, 0},
  {112, 2, 132, 7, 0},
  {114, 2, 132, 0, 0},
  {116, 12, 180, 1, 0},
  {116, 5, 196, 3, 1},
  {128, 2, 160, 5, 0},
  {130, 2, 142, 6, 0},
  {132, 6, 140, 7, 0},
  {132, 5, 148, 0, 1},
  {138, 2, 170, 8, 0},
  {140, 2, 164, 7, 0},
  {142, 2, 162, 6, 0},
  {144, 2, 148, 4, 0},
  {146, 2, 202, 2, 0},
  {148, 12, 194, 0, 0},
  {148, 5, 206, 4, 1},
  {160, 2, 164, 5, 0},
  {162, 2, 174, 6, 0},
  {164, 6, 172, 7, 0},
  {164, 5, 176, 5, 1},
  {170, 2, 348, 8, 0},
  {172, 2, 212, 7, 0},
  {174, 2, 196, 6, 0},
  {176, 4, 180, 5, 0},
  {180, 12, 244, 1, 0},
  {180, 5, 208, 5, 1},
  {194, 2, 228, 0, 0},
  {196, 6, 204, 3, 0},
  {196, 5, 210, 6, 1},
  {202, 2, 298, 2, 0},
  {204, 2, 226, 3, 0},
  {206, 2, 212, 4, 0},
  {208, 2, 234, 5, 0},
  {210, 2, 220, 6, 0},
  {212, 8, 276, 7, 0},
  {212, 5, 236, 4, 1},
  {220, 4, 268, 6, 0},
  {226, 2, 228, 3, 0},
  {228, 6, 244, 3, 0},
  {228, 5, 242, 0, 1},
  {234, 2, 238, 5, 0},
  {236, 2, 240, 4, 0},
  {238, 2, 274, 5, 0},
  {240, 2, 308, 4, 0},
  {242, 2, 260, 0, 0},
  {244, 12, 258, 1, 0},
  {244, 5, 260, 3, 1},
  {258, 2, 266, 1, 0},
  {260, 6, 272, 3, 0},
  {260, 5, 308, 0, 1},
  {266, 2, 270, 1, 0},
  {268, 2, 340, 6, 0},
  {270, 2, 292, 1, 0},
  {272, 2, 276, 3, 0},
  {274, 2, 306, 5, 0},
  {276, 12, 364, 7, 0},
  {276, 5, 288, 3, 1},
  {288, 4, 292, 3, 0},
  {292, 6, 300, 3, 0},
  {292, 5, 338, 1, 1},
  {298, 2, 302, 2, 0},
  {300, 2, 304, 3, 0},
  {302, 2, 312, 2, 0},
  {304, 2, 322, 3, 0},
  {306, 2, 324, 5, 0},
  {308, 4, 354, 4, 0},
  {308, 5, 332, 0, 1},
  {312, 8, 336, 2, 0},
  {322, 2, 324, 3, 0},
  {324, 6, 384, 5, 0},
  {324, 5, 330, 3, 1},
  {330, 2, 334, 3, 0},
  {332, 2, 340, 0, 0},
  {334, 2, 356, 3, 0},
  {336, 2, 402, 2, 0},
  {338, 2, 372, 1, 0},
  {340, 8, 356, 0, 0},
  {340, 5, 352, 6, 1},
  {348, 4, 362, 8, 0},
  {352, 2, 386, 6, 0},
  {354, 2, 400, 4, 0},
  {356, 6, 372, 3, 0},
  {356, 5, 370, 0, 1},
  {362, 2, 366, 8, 0},
  {364, 2, 368, 7, 0},
  {366, 2, 394, 8, 0},
  {368, 2, 388, 7, 0},
  {370, 2, 388, 0, 0},
  {372, 12, 436, 1, 0},
  {372, 5, 432, 3, 1},
  {384, 2, 416, 5, 0},
  {386, 2, 398, 6, 0},
  {388, 6, 396, 7, 0},
  {388, 5, 404, 0, 1},
  {394, 2, 468, 8, 0},
  {396, 2, 476, 7, 0},
  {398, 2, 418, 6, 0},
  {400, 2, 404, 4, 0},
  {402, 2, 420, 2, 0},
  {404, 12, 496, 0, 0},
  {404, 5, 430, 4, 1},
  {416, 2, 420, 5, 0},
  {418, 2, 426, 6, 0},
  {420, 6, 428, 5, 0},
  {420, 5, 458, 2, 1},
  {426, 2, 452, 6, 0},
  {428, 2, 436, 5, 0},
  {430, 2, 462, 4, 0},
  {432, 4, 452, 3, 0},
  {436, 16, 65535, 1, 0},
  {436, 5, 464, 5, 1},
  {452, 6, 460, 3, 0},
  {452, 5, 466, 6, 1},
  {458, 2, 498, 2, 0},
  {460, 2, 482, 3, 0},
  {462, 2, 468, 4, 0},
  {464, 2, 484, 5, 0},
  {466, 2, 492, 6, 0},
  {468, 8, 65535, 8, 0},
  {468, 5, 65535, 4, 1},
  {476, 4, 490, 7, 0},
  {482, 2, 484, 3, 0},
  {484, 6, 65535, 5, 0},
  {484, 5, 500, 3, 1},
  {490, 2, 494, 7, 0},
  {492, 2, 65535, 6, 0},
  {494, 2, 65535, 7, 0},
  {496, 2, 500, 0, 0},
  {498, 2, 65535, 2, 0},
  {500, 8, 65535, 3, 0},
  {500, 5, 65535, 0, 1},
};

constexpr uint16_t SONG_EVENT_COUNT = sizeof(SONG) / sizeof(SONG[0]);
static_assert(sizeof(SongEvent) == 8, "Unexpected song event size");

struct MotorState {
  bool active;
  bool outputHigh;
  uint8_t role;
  uint16_t currentDutyPermille;
  uint16_t attackDutyPermille;
  uint16_t sustainDutyPermille;
  unsigned long attackEndMs;
  unsigned long stopAtMs;
  unsigned long pwmCycleStartUs;
};

MotorState motors[CHANNEL_COUNT];
bool armed = false;
bool songRunning = false;
bool pendingStart = false;
bool pinMapValid = false;
uint16_t nextEvent = 0;
unsigned long songStartMs = 0;
unsigned long startRequestMs = 0;

constexpr uint8_t COMMAND_BUFFER_SIZE = 64;
constexpr uint8_t MAX_SERIAL_BYTES_PER_LOOP = 32;
char commandBuffer[COMMAND_BUFFER_SIZE];
uint8_t commandLength = 0;
bool discardCommandUntilNewline = false;

// ----------------------- Timing -----------------------

uint16_t activeBpmAt(uint16_t tick) {
  const uint16_t written = tick < FINAL_SECTION_TICK
      ? SCORE_BPM : FINAL_SECTION_BPM;
  return (uint32_t)written * TEMPO_PERCENT / 100UL;
}

unsigned long tickToMs(uint16_t tick) {
  // Segmented tempo map: no cumulative floating-point or rounding drift.
  const uint32_t denominator1 =
      (uint32_t)SCORE_BPM * TICKS_PER_QUARTER * TEMPO_PERCENT;
  if (tick <= FINAL_SECTION_TICK) {
    return (uint32_t)tick * 6000000UL / denominator1;
  }
  const uint32_t firstPart =
      (uint32_t)FINAL_SECTION_TICK * 6000000UL / denominator1;
  const uint32_t denominator2 =
      (uint32_t)FINAL_SECTION_BPM * TICKS_PER_QUARTER * TEMPO_PERCENT;
  return firstPart +
      (uint32_t)(tick - FINAL_SECTION_TICK) * 6000000UL / denominator2;
}

bool deadlineReached(unsigned long now, unsigned long deadline) {
  return (long)(now - deadline) >= 0;
}

// ----------------------- Motor safety -----------------------

bool isValidPin(uint8_t pin) {
  return pin >= 2 && pin <= 53;
}

bool validateRequiredPins() {
  for (uint8_t ch = 0; ch < CHANNEL_COUNT; ++ch) {
    if (!CHANNEL_ENABLED[ch]) continue;
    if (!isValidPin(IN1_PINS[ch]) || !isValidPin(IN2_PINS[ch]) ||
        IN1_PINS[ch] == IN2_PINS[ch]) return false;

    // Compare against ALL drivers, including inactive ones. A HIGH on
    // an active pin must never energize a different, disabled driver.
    for (uint8_t other = 0; other < CHANNEL_COUNT; ++other) {
      if (other == ch) continue;
      if (IN1_PINS[ch] == IN1_PINS[other] ||
          IN1_PINS[ch] == IN2_PINS[other] ||
          IN2_PINS[ch] == IN1_PINS[other] ||
          IN2_PINS[ch] == IN2_PINS[other]) return false;
    }
  }
  return true;
}

void writeMotorPinsLow(uint8_t ch) {
  digitalWrite(IN1_PINS[ch], LOW);
  digitalWrite(IN2_PINS[ch], LOW);
}

void stopMotor(uint8_t ch) {
  writeMotorPinsLow(ch);
  motors[ch].active = false;
  motors[ch].outputHigh = false;
  motors[ch].currentDutyPermille = 0;
  motors[ch].attackDutyPermille = 0;
  motors[ch].sustainDutyPermille = 0;
}

void allOff() {
  for (uint8_t ch = 0; ch < CHANNEL_COUNT; ++ch) stopMotor(ch);
}

void initializeMotorPins() {
  for (uint8_t ch = 0; ch < CHANNEL_COUNT; ++ch) {
    // LOW output latch is set before switching the pin to OUTPUT.
    if (isValidPin(IN1_PINS[ch])) {
      digitalWrite(IN1_PINS[ch], LOW);
      pinMode(IN1_PINS[ch], OUTPUT);
    }
    if (isValidPin(IN2_PINS[ch])) {
      digitalWrite(IN2_PINS[ch], LOW);
      pinMode(IN2_PINS[ch], OUTPUT);
    }
    motors[ch].active = false;
    motors[ch].outputHigh = false;
    motors[ch].role = ROLE_SUPPORT;
    motors[ch].currentDutyPermille = 0;
    motors[ch].attackDutyPermille = 0;
    motors[ch].sustainDutyPermille = 0;
    motors[ch].attackEndMs = 0;
    motors[ch].stopAtMs = 0;
    motors[ch].pwmCycleStartUs = 0;
  }
}

uint8_t clampPower(int value) {
  if (value < 0) return 0;
  if (value > MAX_OUTPUT_POWER_PERCENT) return MAX_OUTPUT_POWER_PERCENT;
  return (uint8_t)value;
}

uint8_t activeMotorCount() {
  uint8_t count = 0;
  for (uint8_t ch = 0; ch < CHANNEL_COUNT; ++ch)
    if (motors[ch].active) ++count;
  return count;
}

// ----------------------- Expression -----------------------

uint16_t expressiveHoldMs(const SongEvent &event) {
  const unsigned long start = tickToMs(event.startTick);
  const unsigned long writtenEnd =
      tickToMs(event.startTick + event.durationTicks);
  const unsigned long writtenMs = writtenEnd - start;
  uint16_t gap;

  if (event.role == ROLE_SUPPORT) {
    gap = 65;
  } else if (event.nextSameTick ==
             event.startTick + event.durationTicks) {
    if (writtenMs <= 300) gap = REPEATED_SHORT_GAP_MS;
    else if (writtenMs <= 1100) gap = REPEATED_MEDIUM_GAP_MS;
    else gap = REPEATED_LONG_GAP_MS;
  } else if (writtenMs <= 300) gap = SHORT_RELEASE_GAP_MS;
  else if (writtenMs <= 1100) gap = MEDIUM_RELEASE_GAP_MS;
  else gap = LONG_RELEASE_GAP_MS;

  unsigned long hold = writtenMs > gap ? writtenMs - gap : 0;

  // If two voices demand the same physical motor, never drive across
  // the next note's onset. The melody has already been prioritized.
  if (event.nextSameTick != 65535 &&
      event.nextSameTick > event.startTick) {
    const unsigned long nextStart = tickToMs(event.nextSameTick) - start;
    if (nextStart < hold + gap) {
      hold = nextStart > gap ? nextStart - gap : 0;
    }
  }

  const uint16_t cap = event.role == ROLE_SUPPORT
      ? MAX_SUPPORT_HOLD_MS : MAX_NOTE_HOLD_MS;
  if (hold > cap) hold = cap;
  return (uint16_t)hold;
}

void startExpressiveNote(uint8_t ch, uint16_t holdMs,
                         uint8_t role, unsigned long absoluteStopMs) {
  if (!armed || !pinMapValid || !CHANNEL_ENABLED[ch] || holdMs == 0) return;
  if (activeMotorCount() >= MAX_SIMULTANEOUS_MOTORS &&
      !motors[ch].active) {
    if (role == ROLE_SUPPORT) return;
    // A melody note takes priority over an existing support note.
    for (uint8_t i = 0; i < CHANNEL_COUNT; ++i) {
      if (motors[i].active && motors[i].role == ROLE_SUPPORT) {
        stopMotor(i);
        break;
      }
    }
    if (activeMotorCount() >= MAX_SIMULTANEOUS_MOTORS) return;
  }

  int base = motorPowerPercent[ch];
  if (role == ROLE_SUPPORT) base = (base * 65 + 50) / 100;

  int attack = base;
  int sustain = base;
  uint16_t attackMs = holdMs;

  if (role == ROLE_SUPPORT) {
    attack = base + 1;
    sustain = max((int)MIN_SUPPORT_SUSTAIN_PERCENT, (base * 78 + 50) / 100);
    attackMs = min((uint16_t)80, holdMs);
  } else if (holdMs <= SHORT_NOTE_THRESHOLD_MS) {
    attack = base + 3;
    sustain = attack;
  } else if (holdMs <= MEDIUM_NOTE_THRESHOLD_MS) {
    attack = base + 2;
    sustain = max((int)MIN_MELODY_SUSTAIN_PERCENT, (base * 88 + 50) / 100);
    attackMs = min((uint16_t)ATTACK_MS_MEDIUM, holdMs);
  } else {
    attack = base + 2;
    const int scale = holdMs >= 2000 ? 72 : 78;
    sustain = max((int)MIN_MELODY_SUSTAIN_PERCENT, (base * scale + 50) / 100);
    attackMs = min((uint16_t)ATTACK_MS_LONG, holdMs);
  }

  // A sustain floor is never allowed to exceed the calibrated base.
  sustain = min(sustain, base);
  if (role == ROLE_MELODY && holdMs <= SHORT_NOTE_THRESHOLD_MS)
    sustain = attack;

  stopMotor(ch);  // distinct event = distinct articulation
  MotorState &motor = motors[ch];
  motor.role = role;
  motor.active = true;
  motor.outputHigh = false;
  motor.attackDutyPermille = (uint16_t)clampPower(attack) * 10U;
  motor.sustainDutyPermille = (uint16_t)clampPower(sustain) * 10U;
  motor.currentDutyPermille = motor.attackDutyPermille;
  motor.attackEndMs = millis() + attackMs;
  motor.stopAtMs = absoluteStopMs;
  motor.pwmCycleStartUs = micros();
}

void updateMotorEnvelopes() {
  const unsigned long now = millis();
  for (uint8_t ch = 0; ch < CHANNEL_COUNT; ++ch) {
    MotorState &motor = motors[ch];
    if (!motor.active) continue;
    if (deadlineReached(now, motor.stopAtMs)) {
      stopMotor(ch);
      continue;
    }
    if (deadlineReached(now, motor.attackEndMs))
      motor.currentDutyPermille = motor.sustainDutyPermille;
  }
}

void updateSoftwarePwm() {
  const unsigned long nowUs = micros();
  for (uint8_t ch = 0; ch < CHANNEL_COUNT; ++ch) {
    MotorState &motor = motors[ch];
    if (!motor.active) continue;
    unsigned long phase = nowUs - motor.pwmCycleStartUs;
    if (phase >= PWM_PERIOD_US) {
      motor.pwmCycleStartUs += (phase / PWM_PERIOD_US) * PWM_PERIOD_US;
      phase %= PWM_PERIOD_US;
    }
    const unsigned long onTime =
        (unsigned long)PWM_PERIOD_US * motor.currentDutyPermille / 1000UL;
    const bool high = phase < onTime;
    if (high != motor.outputHigh) {
      digitalWrite(IN2_PINS[ch], LOW);
      digitalWrite(IN1_PINS[ch], high ? HIGH : LOW);
      motor.outputHigh = high;
    }
  }
}

// ----------------------- Song playback -----------------------

SongEvent readSongEvent(uint16_t index) {
  SongEvent event;
  memcpy_P(&event, &SONG[index], sizeof(SongEvent));
  return event;
}

void stopSong() {
  pendingStart = false;
  songRunning = false;
  nextEvent = 0;
  allOff();
}

void beginSongNow() {
  allOff();
  nextEvent = 0;
  songStartMs = millis();
  songRunning = true;
  pendingStart = false;
  Serial.println(F("ACK,INDONESIAPUSAKA,START"));
}

void requestSongStart() {
  if (!armed) {
    Serial.println(F("ERROR,NOT_ARMED"));
    return;
  }
  if (!pinMapValid) {
    Serial.println(F("ERROR,PIN_MAP"));
    return;
  }
  stopSong();
  pendingStart = true;
  startRequestMs = millis();
  Serial.println(F("INDONESIA PUSAKA"));
  Serial.println(F("Starting in 2 seconds..."));
}

void updatePendingStart() {
  if (!pendingStart) return;
  if (!armed) {
    pendingStart = false;
    return;
  }
  if (deadlineReached(millis(), startRequestMs + MANUAL_START_DELAY_MS))
    beginSongNow();
}

void updateSong() {
  if (!songRunning) return;
  const unsigned long elapsed = millis() - songStartMs;
  while (nextEvent < SONG_EVENT_COUNT) {
    const SongEvent event = readSongEvent(nextEvent);
    const unsigned long start = tickToMs(event.startTick);
    if ((long)(elapsed - start) < 0) break;

    const uint16_t hold = expressiveHoldMs(event);
    const unsigned long end = start + hold;
    // Use the score's absolute end time, not "now + duration".
    // A late scheduler iteration cannot accidentally extend a motor run.
    if (hold > 0 && (long)(elapsed - end) < 0) {
      startExpressiveNote(event.channel, hold, event.role, songStartMs + end);
    }
    ++nextEvent;
  }
  if (nextEvent >= SONG_EVENT_COUNT &&
      elapsed >= tickToMs(SONG_END_TICK)) {
    songRunning = false;
    allOff();
    Serial.println(F("ACK,INDONESIAPUSAKA,DONE"));
  }
}

// ----------------------- Serial Monitor -----------------------

void normalizeCommand(char *command) {
  uint8_t writeIndex = 0;
  for (uint8_t readIndex = 0; command[readIndex] != '\0'; ++readIndex) {
    char c = command[readIndex];
    if (c == ' ' || c == '\t' || c == '-' || c == '_') continue;
    if (c >= 'a' && c <= 'z') c -= ('a' - 'A');
    command[writeIndex++] = c;
  }
  command[writeIndex] = '\0';
}

void printStatus() {
  Serial.print(F("STATUS,ARMED="));
  Serial.print(armed ? 1 : 0);
  Serial.print(F(",SONG="));
  Serial.print(songRunning ? 1 : 0);
  Serial.print(F(",EVENT="));
  Serial.print(nextEvent);
  Serial.print('/');
  Serial.print(SONG_EVENT_COUNT);
  Serial.print(F(",BPM="));
  Serial.print(activeBpmAt(songRunning &&
      millis() - songStartMs >= tickToMs(FINAL_SECTION_TICK)
      ? FINAL_SECTION_TICK : 0));
  Serial.print(F(",PINS="));
  Serial.println(pinMapValid ? F("SAFE_SUBSET") : F("INVALID"));
}

void handleCommand(char *command) {
  normalizeCommand(command);
  if (strcmp(command, "ARM") == 0) {
    stopSong();
    if (!pinMapValid) {
      armed = false;
      Serial.println(F("ERROR,PIN_MAP"));
      return;
    }
    armed = true;
    Serial.println(F("ACK,ARM"));
    return;
  }
  if (strcmp(command, "PLAY") == 0 ||
      strcmp(command, "INDONESIAPUSAKA") == 0 ||
      strcmp(command, "PUSAKA") == 0) {
    requestSongStart();
    return;
  }
  if (strcmp(command, "STOP") == 0) {
    stopSong();
    Serial.println(F("ACK,STOP"));
    return;
  }
  if (strcmp(command, "DISARM") == 0 ||
      strcmp(command, "ESTOP") == 0) {
    stopSong();
    armed = false;
    Serial.println(F("ACK,DISARM"));
    return;
  }
  if (strcmp(command, "STATUS") == 0) {
    printStatus();
    return;
  }
  Serial.println(F("ERROR,UNKNOWN_COMMAND"));
}

void readSerial() {
  uint8_t bytesRead = 0;
  while (Serial.available() > 0 && bytesRead < MAX_SERIAL_BYTES_PER_LOOP) {
    const char incoming = (char)Serial.read();
    ++bytesRead;
    if (incoming == '\r' || incoming == '\n') {
      if (!discardCommandUntilNewline && commandLength > 0) {
        commandBuffer[commandLength] = '\0';
        handleCommand(commandBuffer);
      }
      commandLength = 0;
      discardCommandUntilNewline = false;
      continue;
    }
    if (discardCommandUntilNewline) continue;
    if (commandLength < COMMAND_BUFFER_SIZE - 1) {
      commandBuffer[commandLength++] = incoming;
    } else {
      commandLength = 0;
      discardCommandUntilNewline = true;
      Serial.println(F("ERROR,COMMAND_TOO_LONG"));
    }
  }
}

// ----------------------- Setup / loop -----------------------

void setup() {
  armed = false;
  initializeMotorPins();
  pinMapValid = validateRequiredPins();
  Serial.begin(SERIAL_BAUD);
  if (!pinMapValid) Serial.println(F("ERROR,PIN_MAP"));
  Serial.println(F("ANGKLOBOT - INDONESIA PUSAKA READY"));
  Serial.println(F("Commands: ARM, PLAY, INDONESIAPUSAKA, PUSAKA, STOP, DISARM, ESTOP, STATUS"));
}

void loop() {
  updateMotorEnvelopes();
  readSerial();
  updatePendingStart();
  updateSong();
  updateMotorEnvelopes();
  updateSoftwarePwm();
  if (!armed) allOff();
}

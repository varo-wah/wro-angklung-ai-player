/*
  BENGAWAN SOLO — NEW SHEET EDITION
  Target: Arduino Mega 2560
  Source: latest supplied single-staff score, quarter = 80, one sharp.
  25 written bars; perform 1–8, 1–7, 9–25 (first/second endings).
  Melody only: do not invent or copy piano accompaniment.
  Source G major -> C major, transposed down a perfect fifth (-7 semitones).
  All original melodic intervals are retained; no chromatic substitution.
  Output range G3–B4, natural-note-only.

  Written durations and rests are preserved. Slurs between different notes
  are NOT ties and are not merged. Separate repeated notes receive larger
  release gaps; note onset timing is unchanged. Long notes have a short
  attack followed by lower continuous PWM.

  SCORE_BPM = 80. TEMPO_PERCENT = 95 gives 76 BPM for motor testing.
  Set TEMPO_PERCENT = 100 for exact written tempo.
  User's quieter power table and physical pins are preserved.
  No autoplay. ARM is required before PLAY.

  WARNING: supplied wiring duplicates pin 42 (G5 IN2 / C6 IN1).
  This edition uses channels 0–9 only, and validates all required pins.
  Never enable the conflicting channels without correcting the wiring.
  Upload/bootloader pin activity cannot be suppressed by the sketch.
  Use an independent motor-power disconnect and test long holds for
  current, temperature, and mechanical stall before full performance.

  Serial: 115200; Newline or Both NL & CR.
  ARM, PLAY, BENGAWAN, BENGAWANSOLO, STOP, DISARM, ESTOP, STATUS.
*/
#include <Arduino.h>
#include <avr/pgmspace.h>
#include <string.h>
#include <stdlib.h>

constexpr uint8_t CHANNEL_COUNT = 18;
constexpr uint16_t PWM_PERIOD_US = 1000;
constexpr unsigned long SERIAL_BAUD = 115200;
constexpr uint16_t SCORE_BPM = 80;
constexpr uint16_t FINAL_SECTION_BPM = 80;
constexpr uint16_t TEMPO_PERCENT = 95;
constexpr uint16_t TICKS_PER_QUARTER = 4;
constexpr uint16_t FINAL_SECTION_TICK = 512; // no tempo change
constexpr uint16_t SONG_END_TICK = 512;
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
  1, 0, 1, 1, 1, 1, 1, 1, 1,
  1, 0, 0, 0, 0, 0, 0, 0, 0
};

struct __attribute__((packed)) SongEvent {
  uint16_t startTick;
  uint16_t durationTicks;
  uint16_t nextSameTick;  // 65535 means no later event on this channel
  uint8_t channel;
  uint8_t role;
};

const SongEvent SONG[] PROGMEM = {
  {4, 2, 6, 3, 0},
  {6, 2, 16, 3, 0},
  {8, 6, 68, 4, 0},
  {14, 2, 70, 2, 0},
  {16, 16, 104, 3, 0},
  {34, 2, 46, 6, 0},
  {36, 2, 40, 7, 0},
  {38, 2, 48, 8, 0},
  {40, 6, 96, 7, 0},
  {46, 2, 86, 6, 0},
  {48, 16, 80, 8, 0},
  {68, 2, 72, 4, 0},
  {70, 2, 142, 2, 0},
  {72, 6, 88, 4, 0},
  {78, 2, 98, 9, 0},
  {80, 6, 166, 8, 0},
  {86, 2, 162, 6, 0},
  {88, 6, 102, 4, 0},
  {94, 2, 222, 5, 0},
  {96, 2, 164, 7, 0},
  {98, 2, 206, 9, 0},
  {102, 2, 110, 4, 0},
  {104, 6, 132, 3, 0},
  {110, 2, 136, 4, 0},
  {112, 16, 65535, 0, 0},
  {132, 2, 134, 3, 0},
  {134, 2, 144, 3, 0},
  {136, 6, 196, 4, 0},
  {142, 2, 198, 2, 0},
  {144, 16, 232, 3, 0},
  {162, 2, 174, 6, 0},
  {164, 2, 168, 7, 0},
  {166, 2, 176, 8, 0},
  {168, 6, 224, 7, 0},
  {174, 2, 214, 6, 0},
  {176, 16, 208, 8, 0},
  {196, 2, 200, 4, 0},
  {198, 2, 398, 2, 0},
  {200, 6, 216, 4, 0},
  {206, 2, 226, 9, 0},
  {208, 6, 268, 8, 0},
  {214, 2, 292, 6, 0},
  {216, 6, 230, 4, 0},
  {222, 2, 280, 5, 0},
  {224, 2, 240, 7, 0},
  {226, 2, 332, 9, 0},
  {230, 2, 238, 4, 0},
  {232, 6, 400, 3, 0},
  {238, 2, 270, 4, 0},
  {240, 16, 258, 7, 0},
  {258, 2, 260, 7, 0},
  {260, 2, 262, 7, 0},
  {262, 2, 264, 7, 0},
  {264, 2, 266, 7, 0},
  {266, 2, 272, 7, 0},
  {268, 2, 296, 8, 0},
  {270, 2, 312, 4, 0},
  {272, 8, 290, 7, 0},
  {280, 8, 302, 5, 0},
  {290, 2, 294, 7, 0},
  {292, 2, 300, 6, 0},
  {294, 2, 298, 7, 0},
  {296, 2, 322, 8, 0},
  {298, 2, 334, 7, 0},
  {300, 2, 356, 6, 0},
  {302, 2, 304, 5, 0},
  {304, 8, 352, 5, 0},
  {312, 8, 344, 4, 0},
  {322, 2, 324, 8, 0},
  {324, 2, 326, 8, 0},
  {326, 2, 328, 8, 0},
  {328, 2, 330, 8, 0},
  {330, 2, 336, 8, 0},
  {332, 2, 360, 9, 0},
  {334, 2, 358, 7, 0},
  {336, 8, 368, 8, 0},
  {344, 8, 388, 4, 0},
  {352, 2, 354, 5, 0},
  {354, 2, 392, 5, 0},
  {356, 2, 65535, 6, 0},
  {358, 2, 366, 7, 0},
  {360, 6, 422, 9, 0},
  {366, 2, 418, 7, 0},
  {368, 16, 420, 8, 0},
  {388, 2, 390, 4, 0},
  {390, 2, 452, 4, 0},
  {392, 6, 470, 5, 0},
  {398, 2, 454, 2, 0},
  {400, 16, 472, 3, 0},
  {418, 2, 430, 7, 0},
  {420, 2, 424, 8, 0},
  {422, 2, 432, 9, 0},
  {424, 6, 462, 8, 0},
  {430, 2, 464, 7, 0},
  {432, 16, 482, 9, 0},
  {452, 2, 456, 4, 0},
  {454, 2, 488, 2, 0},
  {456, 6, 478, 4, 0},
  {462, 2, 65535, 8, 0},
  {464, 6, 494, 7, 0},
  {470, 2, 480, 5, 0},
  {472, 6, 486, 3, 0},
  {478, 2, 65535, 4, 0},
  {480, 2, 496, 5, 0},
  {482, 2, 65535, 9, 0},
  {486, 2, 65535, 3, 0},
  {488, 6, 65535, 2, 0},
  {494, 2, 65535, 7, 0},
  {496, 16, 65535, 5, 0},
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
  Serial.println(F("ACK,BENGAWAN,START"));
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
  Serial.println(F("BENGAWAN SOLO"));
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
    Serial.println(F("ACK,BENGAWAN,DONE"));
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
  Serial.print(activeBpmAt(0));
  Serial.print(F(",SCORE_BPM=80"));
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
      strcmp(command, "BENGAWAN") == 0 ||
      strcmp(command, "BENGAWANSOLO") == 0) {
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
  Serial.println(F("ANGKLOBOT - BENGAWAN SOLO READY"));
  Serial.println(F("Commands: ARM, PLAY, BENGAWAN, BENGAWANSOLO, STOP, DISARM, ESTOP, STATUS"));
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

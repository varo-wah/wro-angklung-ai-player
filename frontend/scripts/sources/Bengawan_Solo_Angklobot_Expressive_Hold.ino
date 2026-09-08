/*
  BENGAWAN SOLO - ANGKLOBOT EXPRESSIVE HOLD VERSION
  Target: Arduino Mega 2560

  Source arrangement:
    - Based on the supplied D-major treble score.
    - Transposed down one whole step to C major because the physical
      Angklobot rack is natural-note-only (G3-C6).
    - Chromatic ornaments that cannot exist on the natural-only rack are
      simplified to the nearest playable natural note.
    - 47 measures, 4/4, Andante.
    - Manual start only. NO autoplay.

  PERFORMANCE MODEL
  -----------------
  This does NOT treat every written note as a short fixed pulse.

  Short notes:
    - stronger / more direct PWM
    - short motor duration
    - clear articulation

  Medium notes:
    - short attack at normal power
    - then slightly reduced sustain power

  Long notes:
    - strong enough attack to start the shake cleanly
    - lower continuous sustain PWM
    - motor keeps spinning so the angklung actually HOLDS the note
    - avoids making a long note disproportionately loud

  The current quieter Angklobot power table is preserved.

  Serial commands at 115200:
    P = play / restart from beginning
    S = stop immediately
    T = status
*/

#include <Arduino.h>
#include <avr/pgmspace.h>

constexpr uint8_t CHANNEL_COUNT = 18;
constexpr uint16_t PWM_PERIOD_US = 1000;
constexpr unsigned long SERIAL_BAUD = 115200;

// Tempo. Change this one number to speed up / slow down the whole performance.
constexpr uint16_t TEMPO_BPM = 96;

// The event table uses 16th-note ticks:
// 1 tick = sixteenth note
// 2 ticks = eighth note
// 4 ticks = quarter note
// 8 ticks = half note
// 12 ticks = dotted half
// 16 ticks = whole note
constexpr uint8_t TICKS_PER_QUARTER = 4;

// Maximum allowed continuous command for one written note.
// Current arrangement stays below this, but it remains as a hard ceiling.
constexpr uint16_t MAX_NOTE_HOLD_MS = 2500;

// Attack/sustain envelope thresholds.
constexpr uint16_t SHORT_NOTE_THRESHOLD_MS = 420;
constexpr uint16_t MEDIUM_NOTE_THRESHOLD_MS = 900;
constexpr uint16_t ATTACK_MS_MEDIUM = 100;
constexpr uint16_t ATTACK_MS_LONG = 125;

// Keep long-note sustain above this level so a motor is less likely to stall.
constexpr uint8_t MIN_SUSTAIN_POWER_PERCENT = 19;
constexpr uint8_t MAX_OUTPUT_POWER_PERCENT = 45;

// Physical channel order:
// 0=G3, 1=A3, 2=B3, 3=C4, 4=D4, 5=E4, 6=F4,
// 7=G4, 8=A4, 9=B4, 10=C5, 11=D5, 12=E5,
// 13=F5, 14=G5, 15=A5, 16=B5, 17=C6

const uint8_t IN1_PINS[CHANNEL_COUNT] = {
  6, 8, 2, 4, 28, 26, 32, 30, 12,
  10, 24, 22, 36, 34, 41, 38, 44, 42
};

const uint8_t IN2_PINS[CHANNEL_COUNT] = {
  7, 9, 3, 5, 29, 27, 33, 31, 14,
  11, 25, 23, 37, 35, 42, 39, 45, 43
};

// Your quieter power calibration from the successful You Are the Reason build.
uint8_t motorPowerPercent[CHANNEL_COUNT] = {
  25, 25, 25, 25, 25, 25, 25, 25, 25,
  25, 25, 25, 25, 25, 25, 25, 25, 25
};

struct MotorState {
  bool active;
  bool outputHigh;

  uint16_t currentDutyPermille;
  uint16_t attackDutyPermille;
  uint16_t sustainDutyPermille;

  unsigned long attackEndMs;
  unsigned long pulseEndMs;
  unsigned long pwmCycleStartUs;
};

MotorState motors[CHANNEL_COUNT];

struct __attribute__((packed)) SongEvent {
  uint16_t startTick;
  uint8_t durationTicks;
  uint8_t channel;
  uint8_t expressionPercent;
};

const SongEvent SONG[] PROGMEM = {
  {0, 4, 7, 90},
  {4, 4, 7, 90},
  {8, 8, 8, 90},
  {16, 2, 5, 90},
  {18, 2, 6, 90},
  {20, 11, 7, 90},
  {32, 2, 10, 90},
  {34, 2, 11, 90},
  {36, 4, 12, 90},
  {40, 4, 11, 90},
  {44, 4, 10, 90},
  {48, 14, 12, 90},
  {64, 4, 7, 90},
  {68, 4, 5, 90},
  {72, 4, 7, 90},
  {76, 4, 12, 90},
  {80, 4, 11, 90},
  {84, 4, 9, 90},
  {88, 8, 7, 90},
  {96, 2, 8, 90},
  {98, 2, 9, 90},
  {100, 8, 12, 90},
  {108, 4, 7, 90},
  {112, 4, 6, 90},
  {116, 4, 7, 90},
  {120, 8, 5, 90},
  {128, 8, 7, 92},
  {136, 4, 7, 92},
  {140, 4, 8, 92},
  {144, 4, 5, 92},
  {148, 2, 6, 92},
  {150, 9, 7, 92},
  {160, 2, 10, 92},
  {162, 2, 11, 92},
  {164, 4, 12, 92},
  {168, 4, 11, 92},
  {172, 4, 10, 92},
  {176, 14, 12, 92},
  {192, 2, 7, 92},
  {194, 2, 7, 92},
  {196, 4, 5, 92},
  {200, 4, 7, 92},
  {204, 4, 12, 92},
  {208, 4, 11, 92},
  {212, 4, 9, 92},
  {216, 8, 7, 92},
  {224, 2, 8, 92},
  {226, 2, 9, 92},
  {228, 8, 12, 92},
  {236, 4, 7, 92},
  {240, 4, 6, 92},
  {244, 4, 5, 92},
  {248, 8, 10, 92},
  {256, 2, 10, 95},
  {258, 2, 10, 95},
  {260, 2, 10, 98},
  {262, 2, 10, 100},
  {264, 4, 11, 105},
  {268, 4, 10, 105},
  {272, 4, 8, 100},
  {276, 4, 10, 100},
  {280, 2, 9, 95},
  {282, 2, 8, 95},
  {288, 4, 10, 100},
  {292, 4, 9, 98},
  {296, 4, 10, 100},
  {300, 4, 11, 105},
  {304, 4, 10, 100},
  {308, 4, 9, 95},
  {312, 4, 8, 92},
  {316, 4, 7, 90},
  {320, 2, 11, 98},
  {322, 2, 11, 98},
  {324, 2, 11, 100},
  {326, 2, 11, 102},
  {328, 4, 12, 108},
  {332, 4, 11, 105},
  {336, 4, 10, 100},
  {340, 4, 11, 102},
  {344, 2, 10, 95},
  {346, 2, 8, 90},
  {352, 4, 7, 90},
  {356, 4, 8, 92},
  {360, 4, 9, 95},
  {364, 4, 10, 100},
  {368, 8, 12, 108},
  {376, 4, 10, 96},
  {380, 4, 11, 100},
  {384, 2, 3, 76},
  {386, 2, 4, 76},
  {388, 11, 5, 78},
  {400, 2, 3, 76},
  {402, 2, 4, 76},
  {404, 2, 5, 76},
  {406, 2, 6, 76},
  {408, 7, 7, 80},
  {416, 8, 10, 82},
  {424, 4, 7, 78},
  {428, 4, 10, 82},
  {432, 2, 11, 84},
  {434, 2, 12, 84},
  {436, 4, 11, 82},
  {440, 7, 10, 80},
  {448, 2, 7, 78},
  {450, 2, 8, 80},
  {452, 2, 9, 82},
  {454, 2, 10, 84},
  {456, 4, 11, 86},
  {460, 4, 12, 88},
  {464, 4, 11, 86},
  {468, 4, 10, 84},
  {472, 4, 9, 82},
  {476, 4, 8, 80},
  {480, 4, 7, 82},
  {484, 4, 8, 84},
  {488, 4, 9, 86},
  {492, 4, 10, 88},
  {496, 4, 10, 100},
  {500, 4, 10, 100},
  {504, 4, 9, 98},
  {508, 4, 9, 98},
  {512, 4, 8, 95},
  {516, 4, 9, 96},
  {520, 8, 10, 98},
  {528, 4, 7, 88},
  {532, 4, 7, 88},
  {536, 4, 7, 90},
  {540, 4, 8, 92},
  {544, 4, 7, 90},
  {548, 2, 5, 86},
  {550, 2, 6, 88},
  {552, 8, 7, 90},
  {560, 4, 10, 95},
  {564, 4, 11, 98},
  {568, 4, 12, 100},
  {572, 4, 11, 98},
  {576, 4, 10, 95},
  {580, 4, 14, 105},
  {584, 8, 13, 100},
  {592, 4, 7, 86},
  {596, 4, 5, 84},
  {600, 4, 7, 88},
  {604, 2, 11, 96},
  {606, 2, 10, 94},
  {608, 4, 11, 96},
  {612, 4, 10, 94},
  {616, 4, 7, 88},
  {620, 2, 7, 86},
  {622, 2, 7, 86},
  {624, 2, 8, 92},
  {626, 2, 10, 96},
  {628, 4, 11, 98},
  {632, 4, 11, 98},
  {636, 2, 7, 90},
  {638, 2, 6, 88},
  {640, 4, 7, 90},
  {644, 2, 5, 86},
  {646, 2, 6, 88},
  {648, 4, 7, 90},
  {652, 4, 6, 88},
  {656, 4, 7, 88},
  {660, 4, 8, 90},
  {664, 4, 7, 88},
  {668, 4, 5, 84},
  {672, 14, 7, 88},
  {688, 2, 3, 78},
  {690, 2, 5, 80},
  {692, 4, 7, 84},
  {696, 4, 10, 88},
  {700, 2, 0, 74},
  {702, 2, 3, 76},
  {704, 2, 5, 78},
  {706, 2, 7, 82},
  {708, 4, 10, 86},
  {712, 4, 11, 88},
  {716, 4, 10, 86},
  {720, 2, 0, 72},
  {722, 2, 4, 74},
  {724, 4, 7, 78},
  {728, 4, 10, 84},
  {732, 4, 3, 76},
  {736, 4, 7, 80},
  {740, 10, 10, 84},
};

constexpr uint16_t EVENT_COUNT = sizeof(SONG) / sizeof(SONG[0]);
constexpr uint16_t SONG_END_TICK = 752;

bool playing = false;
bool completionPrinted = false;
uint16_t nextEventIndex = 0;
unsigned long songStartMs = 0;

unsigned long tickToMs(uint16_t tick) {
  // quarter-note milliseconds = 60000 / BPM
  // one tick = quarter / 4
  return ((unsigned long)tick * 60000UL) /
         ((unsigned long)TEMPO_BPM * TICKS_PER_QUARTER);
}

bool deadlineReached(unsigned long now, unsigned long deadline) {
  return (long)(now - deadline) >= 0;
}

uint8_t clampPowerPercent(int value) {
  if (value < 0) return 0;
  if (value > MAX_OUTPUT_POWER_PERCENT) return MAX_OUTPUT_POWER_PERCENT;
  return (uint8_t)value;
}

uint16_t percentToPermille(uint8_t percent) {
  return (uint16_t)percent * 10U;
}

void writeMotorPinsLow(uint8_t channel) {
  digitalWrite(IN1_PINS[channel], LOW);
  digitalWrite(IN2_PINS[channel], LOW);
}

void stopMotor(uint8_t channel) {
  writeMotorPinsLow(channel);
  motors[channel].active = false;
  motors[channel].outputHigh = false;
  motors[channel].currentDutyPermille = 0;
  motors[channel].attackDutyPermille = 0;
  motors[channel].sustainDutyPermille = 0;
}

void allOff() {
  for (uint8_t channel = 0; channel < CHANNEL_COUNT; channel++) {
    stopMotor(channel);
  }
}

void startExpressiveNote(
    uint8_t channel,
    uint16_t requestedDurationMs,
    uint8_t expressionPercent
) {
  if (channel >= CHANNEL_COUNT) return;

  uint16_t durationMs = requestedDurationMs;
  if (durationMs > MAX_NOTE_HOLD_MS) {
    durationMs = MAX_NOTE_HOLD_MS;
  }

  // Apply written dynamics/expression to this note while preserving the
  // user's quieter per-motor calibration.
  int expressedBase =
      ((int)motorPowerPercent[channel] * expressionPercent + 50) / 100;

  uint8_t basePower = clampPowerPercent(expressedBase);
  uint8_t attackPower = basePower;
  uint8_t sustainPower = basePower;
  uint16_t attackMs = durationMs;

  if (durationMs <= SHORT_NOTE_THRESHOLD_MS) {
    // Staccato / eighth-note style:
    // slightly stronger because it only speaks for a short time.
    attackPower = clampPowerPercent((int)basePower + 3);
    sustainPower = attackPower;
    attackMs = durationMs;
  }
  else if (durationMs <= MEDIUM_NOTE_THRESHOLD_MS) {
    // Quarter-ish notes:
    // clear attack, then modestly softer continued shake.
    attackPower = clampPowerPercent((int)basePower + 2);
    sustainPower = clampPowerPercent(
        max((int)MIN_SUSTAIN_POWER_PERCENT,
            ((int)basePower * 88 + 50) / 100)
    );
    attackMs = min((uint16_t)ATTACK_MS_MEDIUM, durationMs);
  }
  else {
    // Half / dotted-half / long held notes:
    // let the motor keep spinning, but at substantially lower sustain power.
    attackPower = clampPowerPercent((int)basePower + 2);

    int sustainScale = 78;
    if (durationMs >= 1500) {
      sustainScale = 72;
    }

    sustainPower = clampPowerPercent(
        max((int)MIN_SUSTAIN_POWER_PERCENT,
            ((int)basePower * sustainScale + 50) / 100)
    );

    attackMs = min((uint16_t)ATTACK_MS_LONG, durationMs);
  }

  writeMotorPinsLow(channel);

  MotorState &motor = motors[channel];
  motor.active = attackPower > 0;
  motor.outputHigh = false;
  motor.attackDutyPermille = percentToPermille(attackPower);
  motor.sustainDutyPermille = percentToPermille(sustainPower);
  motor.currentDutyPermille = motor.attackDutyPermille;

  const unsigned long nowMs = millis();
  motor.attackEndMs = nowMs + attackMs;
  motor.pulseEndMs = nowMs + durationMs;
  motor.pwmCycleStartUs = micros();
}

void updateMotorEnvelopes() {
  const unsigned long nowMs = millis();

  for (uint8_t channel = 0; channel < CHANNEL_COUNT; channel++) {
    MotorState &motor = motors[channel];

    if (!motor.active) continue;

    if (deadlineReached(nowMs, motor.pulseEndMs)) {
      stopMotor(channel);
      continue;
    }

    if (deadlineReached(nowMs, motor.attackEndMs)) {
      motor.currentDutyPermille = motor.sustainDutyPermille;
    }
  }
}

void updateSoftwarePwm() {
  const unsigned long nowUs = micros();

  for (uint8_t channel = 0; channel < CHANNEL_COUNT; channel++) {
    MotorState &motor = motors[channel];
    if (!motor.active) continue;

    unsigned long phaseUs = nowUs - motor.pwmCycleStartUs;

    if (phaseUs >= PWM_PERIOD_US) {
      motor.pwmCycleStartUs +=
          (phaseUs / PWM_PERIOD_US) * PWM_PERIOD_US;
      phaseUs %= PWM_PERIOD_US;
    }

    const unsigned long onTimeUs =
        (unsigned long)PWM_PERIOD_US *
        motor.currentDutyPermille / 1000UL;

    const bool shouldBeHigh = phaseUs < onTimeUs;

    if (shouldBeHigh != motor.outputHigh) {
      digitalWrite(IN2_PINS[channel], LOW);
      digitalWrite(
          IN1_PINS[channel],
          shouldBeHigh ? HIGH : LOW
      );
      motor.outputHigh = shouldBeHigh;
    }
  }
}

SongEvent readSongEvent(uint16_t index) {
  SongEvent event;
  memcpy_P(&event, &SONG[index], sizeof(SongEvent));
  return event;
}

void beginPlayback() {
  allOff();
  nextEventIndex = 0;
  songStartMs = millis();
  playing = true;
  completionPrinted = false;

  Serial.print(F("PLAYING BENGAWAN SOLO - EVENTS="));
  Serial.println(EVENT_COUNT);
}

void stopPlayback() {
  playing = false;
  allOff();
  Serial.println(F("STOPPED"));
}

void processSongEvents() {
  if (!playing) return;

  const unsigned long elapsedMs = millis() - songStartMs;

  while (nextEventIndex < EVENT_COUNT) {
    const SongEvent event = readSongEvent(nextEventIndex);
    const unsigned long eventStartMs = tickToMs(event.startTick);

    if ((long)(elapsedMs - eventStartMs) < 0) {
      break;
    }

    uint16_t durationMs =
        (uint16_t)min(
            tickToMs(event.durationTicks),
            (unsigned long)MAX_NOTE_HOLD_MS
        );

    startExpressiveNote(
        event.channel,
        durationMs,
        event.expressionPercent
    );

    nextEventIndex++;
  }

  const unsigned long songEndMs = tickToMs(SONG_END_TICK);

  if (nextEventIndex >= EVENT_COUNT &&
      elapsedMs >= songEndMs) {
    playing = false;
    allOff();

    if (!completionPrinted) {
      completionPrinted = true;
      Serial.println(F("BENGAWAN SOLO COMPLETE"));
    }
  }
}

void processSerial() {
  while (Serial.available() > 0) {
    const char command = Serial.read();

    if (command == 'P' || command == 'p') {
      beginPlayback();
    }
    else if (command == 'S' || command == 's') {
      stopPlayback();
    }
    else if (command == 'T' || command == 't') {
      Serial.print(F("PLAYING="));
      Serial.print(playing ? F("TRUE") : F("FALSE"));
      Serial.print(F(", EVENT="));
      Serial.print(nextEventIndex);
      Serial.print('/');
      Serial.println(EVENT_COUNT);
    }
  }
}

void setup() {
  for (uint8_t channel = 0; channel < CHANNEL_COUNT; channel++) {
    digitalWrite(IN1_PINS[channel], LOW);
    digitalWrite(IN2_PINS[channel], LOW);

    pinMode(IN1_PINS[channel], OUTPUT);
    pinMode(IN2_PINS[channel], OUTPUT);

    motors[channel].active = false;
    motors[channel].outputHigh = false;
    motors[channel].currentDutyPermille = 0;
    motors[channel].attackDutyPermille = 0;
    motors[channel].sustainDutyPermille = 0;
    motors[channel].attackEndMs = 0;
    motors[channel].pulseEndMs = 0;
    motors[channel].pwmCycleStartUs = 0;

    writeMotorPinsLow(channel);
  }

  Serial.begin(SERIAL_BAUD);

  Serial.println(F("ANGKLOBOT - BENGAWAN SOLO"));
  Serial.println(F("Manual start only. Press P to play."));
  Serial.println(F("P=PLAY/RESTART, S=STOP, T=STATUS"));
}

void loop() {
  processSerial();
  processSongEvents();
  updateMotorEnvelopes();
  updateSoftwarePwm();
}

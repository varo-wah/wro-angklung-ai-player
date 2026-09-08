/*
  INDONESIA RAYA - ANGKLOBOT
  Sheet-accurate melody version
  Target: Arduino Mega 2560

  SOURCE / TRANSPOSITION
  ----------------------
  - Reconstructed from the supplied G-major staff notation
  - 4/4 with pickup
  - dotted rhythms, rests, ties, and refrain repeat preserved
  - written G major is transposed UP a perfect fourth to C major
  - this preserves the melody exactly while removing the physical F# problem
  - resulting playable range fits the natural-note G3-C6 rack

  TEMPO
  -----
  Standard reference tempo: 96 BPM
  Robot default: 92 BPM
  92 BPM is ~4.2% slower, giving the motors slightly more settling time.
  Change PLAYBACK_BPM to 96 for standard speed.

  ARTICULATION
  ------------
  Note START times remain exact.
  Untied notes release slightly before their written end to create a small
  physical rest between motor activations.
  Back-to-back repetitions of the SAME note get a larger release gap so
  each repeated attack is clearly audible.
  Tied notes remain nearly continuous.

  Long notes use:
      attack -> lower continuous sustain

  NO AUTOPLAY.
  ARM is required before PLAY.

  Serial Monitor: 115200 baud

  Commands:
    ARM
    PLAY
    INDONESIARAYA
    STOP
    DISARM
    ESTOP
    STATUS
*/

#include <Arduino.h>
#include <avr/pgmspace.h>
#include <string.h>

constexpr uint8_t CHANNEL_COUNT = 18;
constexpr uint16_t PWM_PERIOD_US = 1000;
constexpr unsigned long SERIAL_BAUD = 115200;

constexpr uint16_t SCORE_BPM = 96;
constexpr uint16_t PLAYBACK_BPM = 92;

constexpr uint8_t TICKS_PER_QUARTER = 4;
constexpr unsigned long MANUAL_START_DELAY_MS = 2000;

// Small physical release gaps.
// These affect motor HOLD length only; event start times never move.
constexpr uint16_t SHORT_RELEASE_GAP_MS = 35;
constexpr uint16_t MEDIUM_RELEASE_GAP_MS = 45;
constexpr uint16_t LONG_RELEASE_GAP_MS = 55;
constexpr uint16_t TIED_RELEASE_GAP_MS = 15;

// Repeated-note articulation:
// If the very next written note is the SAME physical angklung and begins
// immediately after this one, release the current motor earlier so the
// repeated note has a clearly audible break.
constexpr uint16_t REPEATED_SHORT_GAP_MS = 90;
constexpr uint16_t REPEATED_MEDIUM_GAP_MS = 110;
constexpr uint16_t REPEATED_LONG_GAP_MS = 130;

// Expressive motor envelope.
constexpr uint16_t SHORT_NOTE_THRESHOLD_MS = 240;
constexpr uint16_t MEDIUM_NOTE_THRESHOLD_MS = 800;
constexpr uint16_t ATTACK_MS_MEDIUM = 100;
constexpr uint16_t ATTACK_MS_LONG = 125;

constexpr uint16_t MAX_NOTE_HOLD_MS = 3000;
constexpr uint8_t MIN_SUSTAIN_POWER_PERCENT = 20;
constexpr uint8_t MAX_OUTPUT_POWER_PERCENT = 42;

constexpr uint8_t FLAG_TIED = 1;

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

// Preserved quieter calibration.
uint8_t motorPowerPercent[CHANNEL_COUNT] = {
  35, 30, 25, 30, 30, 30, 30, 35, 30,
  25, 30, 30, 30, 30, 35, 30, 25, 30
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
  uint8_t flags;
};

const SongEvent SONG[] PROGMEM = {
  {0, 3, 5, 0},
  {3, 1, 6, 0},
  {4, 4, 7, 0},
  {8, 7, 12, 1},
  {15, 1, 12, 0},
  {16, 3, 11, 0},
  {19, 1, 11, 0},
  {20, 4, 10, 0},
  {24, 6, 7, 0},
  {32, 3, 7, 0},
  {35, 1, 7, 0},
  {36, 4, 8, 0},
  {40, 4, 7, 0},
  {44, 4, 6, 0},
  {48, 4, 5, 0},
  {52, 10, 4, 1},
  {64, 3, 4, 0},
  {67, 1, 5, 0},
  {68, 4, 6, 0},
  {72, 7, 11, 1},
  {79, 1, 11, 0},
  {80, 3, 10, 0},
  {83, 1, 10, 0},
  {84, 4, 9, 0},
  {88, 6, 8, 0},
  {96, 3, 7, 0},
  {99, 1, 7, 0},
  {100, 4, 9, 0},
  {104, 4, 8, 0},
  {108, 4, 7, 0},
  {112, 4, 6, 0},
  {116, 10, 5, 1},
  {128, 3, 5, 0},
  {131, 1, 6, 0},
  {132, 4, 7, 0},
  {136, 7, 12, 1},
  {143, 1, 12, 0},
  {144, 3, 11, 0},
  {147, 1, 11, 0},
  {148, 4, 10, 0},
  {152, 6, 7, 0},
  {160, 3, 7, 0},
  {163, 1, 7, 0},
  {164, 4, 8, 0},
  {168, 4, 7, 0},
  {172, 4, 10, 0},
  {176, 4, 11, 0},
  {180, 8, 9, 0},
  {188, 2, 8, 0},
  {192, 3, 8, 0},
  {195, 1, 8, 0},
  {196, 4, 13, 0},
  {200, 4, 13, 0},
  {204, 4, 12, 0},
  {208, 4, 11, 0},
  {212, 8, 14, 0},
  {220, 2, 10, 0},
  {224, 3, 9, 0},
  {227, 1, 8, 0},
  {228, 4, 7, 0},
  {232, 4, 13, 0},
  {236, 4, 12, 0},
  {240, 4, 11, 0},
  {244, 10, 10, 1},
  {256, 3, 7, 0},
  {259, 1, 7, 0},
  {260, 4, 8, 0},
  {264, 3, 13, 0},
  {267, 1, 13, 0},
  {268, 4, 13, 0},
  {272, 3, 13, 0},
  {275, 1, 13, 0},
  {276, 4, 12, 0},
  {280, 3, 10, 0},
  {283, 1, 10, 0},
  {284, 4, 10, 0},
  {288, 3, 9, 0},
  {291, 1, 10, 0},
  {292, 4, 11, 0},
  {296, 3, 14, 0},
  {299, 1, 14, 0},
  {300, 4, 14, 0},
  {304, 3, 13, 0},
  {307, 1, 13, 0},
  {308, 8, 12, 0},
  {316, 2, 10, 0},
  {320, 3, 7, 0},
  {323, 1, 7, 0},
  {324, 4, 8, 0},
  {328, 3, 13, 0},
  {331, 1, 13, 0},
  {332, 4, 13, 0},
  {336, 3, 13, 0},
  {339, 1, 13, 0},
  {340, 4, 12, 0},
  {344, 3, 10, 0},
  {347, 1, 10, 0},
  {348, 4, 10, 0},
  {352, 3, 9, 0},
  {355, 1, 10, 0},
  {356, 4, 11, 0},
  {360, 4, 14, 0},
  {364, 4, 14, 0},
  {368, 3, 12, 0},
  {371, 1, 11, 0},
  {372, 10, 10, 1},
  {384, 3, 10, 0},
  {387, 1, 10, 0},
  {388, 4, 13, 0},
  {392, 3, 15, 0},
  {395, 1, 15, 0},
  {396, 4, 15, 0},
  {400, 3, 15, 0},
  {403, 1, 15, 0},
  {404, 4, 14, 0},
  {408, 3, 12, 0},
  {411, 1, 12, 0},
  {412, 4, 12, 0},
  {416, 3, 14, 0},
  {419, 1, 14, 0},
  {420, 4, 13, 0},
  {424, 3, 11, 0},
  {427, 1, 11, 0},
  {428, 4, 11, 0},
  {432, 3, 14, 0},
  {435, 1, 13, 0},
  {436, 8, 12, 0},
  {444, 2, 10, 0},
  {448, 3, 10, 0},
  {451, 1, 10, 0},
  {452, 4, 13, 0},
  {456, 3, 15, 0},
  {459, 1, 15, 0},
  {460, 4, 15, 0},
  {464, 3, 15, 0},
  {467, 1, 15, 0},
  {468, 4, 14, 0},
  {472, 3, 12, 0},
  {475, 1, 12, 0},
  {476, 4, 12, 0},
  {480, 3, 14, 0},
  {483, 1, 14, 0},
  {484, 4, 14, 0},
  {488, 3, 13, 0},
  {491, 1, 12, 0},
  {492, 4, 11, 0},
  {496, 3, 12, 0},
  {499, 1, 11, 0},
  {500, 10, 10, 1},
  {512, 3, 10, 0},
  {515, 1, 10, 0},
  {516, 4, 13, 0},
  {520, 3, 15, 0},
  {523, 1, 15, 0},
  {524, 4, 15, 0},
  {528, 3, 15, 0},
  {531, 1, 15, 0},
  {532, 4, 14, 0},
  {536, 3, 12, 0},
  {539, 1, 12, 0},
  {540, 4, 12, 0},
  {544, 3, 14, 0},
  {547, 1, 14, 0},
  {548, 4, 13, 0},
  {552, 3, 11, 0},
  {555, 1, 11, 0},
  {556, 4, 11, 0},
  {560, 3, 14, 0},
  {563, 1, 13, 0},
  {564, 8, 12, 0},
  {572, 2, 10, 0},
  {576, 3, 10, 0},
  {579, 1, 10, 0},
  {580, 4, 13, 0},
  {584, 3, 15, 0},
  {587, 1, 15, 0},
  {588, 4, 15, 0},
  {592, 3, 15, 0},
  {595, 1, 15, 0},
  {596, 4, 14, 0},
  {600, 3, 12, 0},
  {603, 1, 12, 0},
  {604, 4, 12, 0},
  {608, 3, 14, 0},
  {611, 1, 14, 0},
  {612, 4, 14, 0},
  {616, 3, 13, 0},
  {619, 1, 12, 0},
  {620, 4, 11, 0},
  {624, 3, 12, 0},
  {627, 1, 11, 0},
  {628, 10, 10, 1},
};

constexpr uint16_t SONG_EVENT_COUNT =
    sizeof(SONG) / sizeof(SONG[0]);

constexpr uint16_t SONG_END_TICK = 640;

bool armed = false;
bool songRunning = false;
bool pendingStart = false;
bool completionPrinted = false;

uint16_t nextEvent = 0;

unsigned long songStartMs = 0;
unsigned long startRequestMs = 0;

constexpr uint8_t COMMAND_BUFFER_SIZE = 64;
char commandBuffer[COMMAND_BUFFER_SIZE];
uint8_t commandLength = 0;

// ============================================================
// TIMING
// ============================================================

unsigned long tickToMs(uint16_t tick) {
  return (
      (unsigned long)tick * 60000UL
  ) / (
      (unsigned long)PLAYBACK_BPM *
      TICKS_PER_QUARTER
  );
}

bool deadlineReached(unsigned long now, unsigned long deadline) {
  return (long)(now - deadline) >= 0;
}

uint16_t musicalHoldMs(
    uint8_t durationTicks,
    uint8_t flags,
    bool repeatedSameNote
) {
  unsigned long writtenMs = tickToMs(durationTicks);

  uint16_t gapMs;

  if (flags & FLAG_TIED) {
    // A tie means this is musically continuous, so do NOT create a large gap.
    gapMs = TIED_RELEASE_GAP_MS;
  }
  else if (repeatedSameNote) {
    // Same note immediately repeated:
    // shorten the first motor run more aggressively so the second attack
    // is clearly separated instead of sounding like one long shake.
    if (writtenMs <= 300) {
      gapMs = REPEATED_SHORT_GAP_MS;
    }
    else if (writtenMs <= 900) {
      gapMs = REPEATED_MEDIUM_GAP_MS;
    }
    else {
      gapMs = REPEATED_LONG_GAP_MS;
    }
  }
  else if (writtenMs <= 260) {
    gapMs = SHORT_RELEASE_GAP_MS;
  }
  else if (writtenMs <= 850) {
    gapMs = MEDIUM_RELEASE_GAP_MS;
  }
  else {
    gapMs = LONG_RELEASE_GAP_MS;
  }

  // Never shorten a very short note into almost nothing.
  // Keep at least 45% of its written duration.
  const unsigned long minimumHoldMs =
      max(
          70UL,
          writtenMs * 45UL / 100UL
      );

  unsigned long holdMs = writtenMs;

  if (writtenMs > gapMs) {
    holdMs = writtenMs - gapMs;
  }

  if (holdMs < minimumHoldMs) {
    holdMs = minimumHoldMs;
  }

  if (holdMs > MAX_NOTE_HOLD_MS) {
    holdMs = MAX_NOTE_HOLD_MS;
  }

  return (uint16_t)holdMs;
}

// ============================================================
// MOTOR CONTROL
// ============================================================

uint8_t clampPowerPercent(int value) {
  if (value < 0) return 0;

  if (value > MAX_OUTPUT_POWER_PERCENT) {
    return MAX_OUTPUT_POWER_PERCENT;
  }

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
    uint16_t durationMs
) {
  if (channel >= CHANNEL_COUNT) return;

  int basePower = motorPowerPercent[channel];

  uint8_t attackPower = clampPowerPercent(basePower);
  uint8_t sustainPower = attackPower;
  uint16_t attackMs = durationMs;

  if (durationMs <= SHORT_NOTE_THRESHOLD_MS) {
    // Sixteenth-note style articulation.
    attackPower = clampPowerPercent(basePower + 3);
    sustainPower = attackPower;
    attackMs = durationMs;
  }
  else if (durationMs <= MEDIUM_NOTE_THRESHOLD_MS) {
    // Eighth / dotted-eighth / quarter territory.
    attackPower = clampPowerPercent(basePower + 2);

    sustainPower = clampPowerPercent(
        max(
            (int)MIN_SUSTAIN_POWER_PERCENT,
            (basePower * 88 + 50) / 100
        )
    );

    attackMs = min(
        (uint16_t)ATTACK_MS_MEDIUM,
        durationMs
    );
  }
  else {
    // Long note: keep the angklung shaking rather than chopping the note.
    attackPower = clampPowerPercent(basePower + 2);

    int sustainScale = 77;

    if (durationMs >= 1400) {
      sustainScale = 73;
    }

    if (durationMs >= 2100) {
      sustainScale = 69;
    }

    sustainPower = clampPowerPercent(
        max(
            (int)MIN_SUSTAIN_POWER_PERCENT,
            (basePower * sustainScale + 50) / 100
        )
    );

    attackMs = min(
        (uint16_t)ATTACK_MS_LONG,
        durationMs
    );
  }

  writeMotorPinsLow(channel);

  MotorState &motor = motors[channel];

  motor.active = attackPower > 0;
  motor.outputHigh = false;

  motor.attackDutyPermille =
      percentToPermille(attackPower);

  motor.sustainDutyPermille =
      percentToPermille(sustainPower);

  motor.currentDutyPermille =
      motor.attackDutyPermille;

  const unsigned long nowMs = millis();

  motor.attackEndMs =
      nowMs + attackMs;

  motor.pulseEndMs =
      nowMs + durationMs;

  motor.pwmCycleStartUs =
      micros();
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
      motor.currentDutyPermille =
          motor.sustainDutyPermille;
    }
  }
}

void updateSoftwarePwm() {
  const unsigned long nowUs = micros();

  for (uint8_t channel = 0; channel < CHANNEL_COUNT; channel++) {
    MotorState &motor = motors[channel];

    if (!motor.active) continue;

    unsigned long phaseUs =
        nowUs - motor.pwmCycleStartUs;

    if (phaseUs >= PWM_PERIOD_US) {
      motor.pwmCycleStartUs +=
          (phaseUs / PWM_PERIOD_US) *
          PWM_PERIOD_US;

      phaseUs %= PWM_PERIOD_US;
    }

    const unsigned long onTimeUs =
        (unsigned long)PWM_PERIOD_US *
        motor.currentDutyPermille /
        1000UL;

    const bool shouldBeHigh =
        phaseUs < onTimeUs;

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

// ============================================================
// SONG PLAYBACK
// ============================================================

SongEvent readSongEvent(uint16_t index) {
  SongEvent event;

  memcpy_P(
      &event,
      &SONG[index],
      sizeof(SongEvent)
  );

  return event;
}

void beginSongNow() {
  allOff();

  nextEvent = 0;
  songStartMs = millis();

  songRunning = true;
  pendingStart = false;
  completionPrinted = false;

  Serial.println(
      F("ACK,INDONESIARAYA,START")
  );
}

void requestSongStart() {
  if (!armed) {
    Serial.println(F("ERROR,NOT_ARMED"));
    return;
  }

  allOff();

  songRunning = false;
  pendingStart = true;
  nextEvent = 0;

  startRequestMs = millis();

  Serial.println(F("INDONESIA RAYA"));
  Serial.println(F("Starting in 2 seconds..."));
}

void stopSong() {
  pendingStart = false;
  songRunning = false;
  nextEvent = 0;

  allOff();
}

void updatePendingStart() {
  if (!pendingStart) return;

  if (!armed) {
    pendingStart = false;
    return;
  }

  if (
      deadlineReached(
          millis(),
          startRequestMs + MANUAL_START_DELAY_MS
      )
  ) {
    beginSongNow();
  }
}

void updateSong() {
  if (!songRunning) return;

  const unsigned long elapsedMs =
      millis() - songStartMs;

  while (nextEvent < SONG_EVENT_COUNT) {
    const SongEvent event =
        readSongEvent(nextEvent);

    const unsigned long eventStartMs =
        tickToMs(event.startTick);

    if ((long)(elapsedMs - eventStartMs) < 0) {
      break;
    }

    // Detect an immediately repeated SAME note.
    // Start timing is never changed; only the current note's motor hold
    // is shortened to create a more obvious break before the repeat.
    bool repeatedSameNote = false;

    if (
        nextEvent + 1 < SONG_EVENT_COUNT &&
        !(event.flags & FLAG_TIED)
    ) {
      const SongEvent nextSongEvent =
          readSongEvent(nextEvent + 1);

      const uint16_t currentWrittenEndTick =
          event.startTick + event.durationTicks;

      repeatedSameNote =
          nextSongEvent.channel == event.channel &&
          nextSongEvent.startTick == currentWrittenEndTick;
    }

    startExpressiveNote(
        event.channel,
        musicalHoldMs(
            event.durationTicks,
            event.flags,
            repeatedSameNote
        )
    );

    nextEvent++;
  }

  const unsigned long songEndMs =
      tickToMs(SONG_END_TICK);

  if (
      nextEvent >= SONG_EVENT_COUNT &&
      elapsedMs >= songEndMs
  ) {
    songRunning = false;
    allOff();

    if (!completionPrinted) {
      completionPrinted = true;

      Serial.println(
          F("ACK,INDONESIARAYA,DONE")
      );
    }
  }
}

// ============================================================
// SERIAL MONITOR
// ============================================================

void normalizeCommand(char *command) {
  uint8_t writeIndex = 0;

  for (
      uint8_t readIndex = 0;
      command[readIndex] != '\0';
      readIndex++
  ) {
    char c = command[readIndex];

    if (
        c == ' ' ||
        c == '\t' ||
        c == '-' ||
        c == '_'
    ) {
      continue;
    }

    if (c >= 'a' && c <= 'z') {
      c -= ('a' - 'A');
    }

    command[writeIndex++] = c;
  }

  command[writeIndex] = '\0';
}

void handleCommand(char *command) {
  normalizeCommand(command);

  if (strcmp(command, "ARM") == 0) {
    stopSong();
    armed = true;

    Serial.println(F("ACK,ARM"));
    return;
  }

  if (
      strcmp(command, "PLAY") == 0 ||
      strcmp(command, "INDONESIARAYA") == 0 ||
      strcmp(command, "INDONESIA") == 0
  ) {
    requestSongStart();
    return;
  }

  if (strcmp(command, "STOP") == 0) {
    stopSong();

    Serial.println(F("ACK,STOP"));
    return;
  }

  if (
      strcmp(command, "DISARM") == 0 ||
      strcmp(command, "ESTOP") == 0
  ) {
    stopSong();
    armed = false;

    Serial.println(F("ACK,DISARM"));
    return;
  }

  if (strcmp(command, "STATUS") == 0) {
    Serial.print(F("STATUS,ARMED="));
    Serial.print(armed ? 1 : 0);

    Serial.print(F(",SONG="));
    Serial.print(songRunning ? 1 : 0);

    Serial.print(F(",EVENT="));
    Serial.print(nextEvent);

    Serial.print('/');
    Serial.print(SONG_EVENT_COUNT);

    Serial.print(F(",BPM="));
    Serial.println(PLAYBACK_BPM);

    return;
  }

  Serial.println(F("ERROR,UNKNOWN_COMMAND"));
}

void readSerial() {
  while (Serial.available() > 0) {
    const char incoming =
        (char)Serial.read();

    if (incoming == '\r') {
      continue;
    }

    if (incoming == '\n') {
      if (commandLength > 0) {
        commandBuffer[commandLength] = '\0';

        handleCommand(commandBuffer);

        commandLength = 0;
      }

      continue;
    }

    if (commandLength < COMMAND_BUFFER_SIZE - 1) {
      commandBuffer[commandLength++] = incoming;
    }
    else {
      commandLength = 0;

      Serial.println(
          F("ERROR,COMMAND_TOO_LONG")
      );
    }
  }
}

// ============================================================
// SETUP / LOOP
// ============================================================

void setup() {
  armed = false;
  songRunning = false;
  pendingStart = false;

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

  Serial.println(
      F("ANGKLOBOT - INDONESIA RAYA READY")
  );

  Serial.println(
      F("Commands: ARM, PLAY, INDONESIARAYA, STOP, DISARM, ESTOP, STATUS")
  );
}

void loop() {
  readSerial();

  updatePendingStart();
  updateSong();

  updateMotorEnvelopes();
  updateSoftwarePwm();

  if (!armed) {
    allOff();
  }
}

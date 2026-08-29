// =====================================================
// ANGKLUNG SOFTWARE PWM TEST
// Arduino Mega 2560
// =====================================================


// =====================================================
// EASY SETTINGS — EDIT THESE
// =====================================================

// ----- MOTOR PINS -----

const int NOTE5_A = 2;
const int NOTE5_B = 3;

const int NOTE7_A = 4;
const int NOTE7_B = 5;

const int NOTE2_A = 26;
const int NOTE2_B = 27;

const int NOTE4_A = 28;
const int NOTE4_B = 29;


// ----- MOTOR POWER (%) -----

const int NOTE5_POWER = 32;
const int NOTE7_POWER = 25;
const int NOTE2_POWER = 35;
const int NOTE4_POWER = 33;


// ----- TIMING (SECONDS) -----

const float SINGLE_NOTE_SECONDS = 1.0;
const float ALL_NOTES_SECONDS   = 2.0;

const float GAP_BETWEEN_NOTES_SECONDS = 0.5;
const float GAP_BEFORE_ALL_SECONDS    = 1.0;
const float LOOP_WAIT_SECONDS         = 4.0;


// ----- PWM -----
//
// 1000 us period = approximately 1 kHz
//
const unsigned int PWM_PERIOD_US = 1000;


// =====================================================
// SETUP
// =====================================================

void setup() {

  Serial.begin(9600);

  pinMode(NOTE5_A, OUTPUT);
  pinMode(NOTE5_B, OUTPUT);

  pinMode(NOTE7_A, OUTPUT);
  pinMode(NOTE7_B, OUTPUT);

  pinMode(NOTE2_A, OUTPUT);
  pinMode(NOTE2_B, OUTPUT);

  pinMode(NOTE4_A, OUTPUT);
  pinMode(NOTE4_B, OUTPUT);

  stopAllMotors();

  Serial.println("Angklung PWM Test Ready");

  delay(2000);
}


// =====================================================
// MAIN LOOP
// =====================================================

void loop() {

  // NOTE 5
  Serial.print("Playing Note 5 at ");
  Serial.print(NOTE5_POWER);
  Serial.println("%");

  playMotorPWM(
    NOTE5_A,
    NOTE5_B,
    NOTE5_POWER,
    SINGLE_NOTE_SECONDS
  );

  stopAllMotors();
  delaySeconds(GAP_BETWEEN_NOTES_SECONDS);


  // NOTE 7
  Serial.print("Playing Note 7 at ");
  Serial.print(NOTE7_POWER);
  Serial.println("%");

  playMotorPWM(
    NOTE7_A,
    NOTE7_B,
    NOTE7_POWER,
    SINGLE_NOTE_SECONDS
  );

  stopAllMotors();
  delaySeconds(GAP_BETWEEN_NOTES_SECONDS);


  // NOTE 2
  Serial.print("Playing Note 2 at ");
  Serial.print(NOTE2_POWER);
  Serial.println("%");

  playMotorPWM(
    NOTE2_A,
    NOTE2_B,
    NOTE2_POWER,
    SINGLE_NOTE_SECONDS
  );

  stopAllMotors();
  delaySeconds(GAP_BETWEEN_NOTES_SECONDS);


  // NOTE 4
  Serial.print("Playing Note 4 at ");
  Serial.print(NOTE4_POWER);
  Serial.println("%");

  playMotorPWM(
    NOTE4_A,
    NOTE4_B,
    NOTE4_POWER,
    SINGLE_NOTE_SECONDS
  );

  stopAllMotors();

  delaySeconds(GAP_BEFORE_ALL_SECONDS);


  // =================================================
  // ALL FOUR TOGETHER
  // =================================================

  Serial.println("Playing ALL notes together");

  playAllMotors(ALL_NOTES_SECONDS);

  stopAllMotors();

  Serial.println("All motors OFF");
  Serial.println("-------------------------");

  delaySeconds(LOOP_WAIT_SECONDS);
}


// =====================================================
// SINGLE MOTOR SOFTWARE PWM
// =====================================================

void playMotorPWM(
  int pinA,
  int pinB,
  int dutyPercent,
  float durationSeconds
) {

  // Prevent reverse direction
  digitalWrite(pinB, LOW);

  unsigned int highTime =
    (PWM_PERIOD_US * dutyPercent) / 100;

  unsigned int lowTime =
    PWM_PERIOD_US - highTime;

  unsigned long durationMs =
    (unsigned long)(durationSeconds * 1000.0);

  unsigned long cycles =
    (durationMs * 1000UL) / PWM_PERIOD_US;


  for (unsigned long i = 0; i < cycles; i++) {

    if (dutyPercent > 0) {
      digitalWrite(pinA, HIGH);

      if (highTime > 0) {
        delayMicroseconds(highTime);
      }
    }


    digitalWrite(pinA, LOW);

    if (lowTime > 0) {
      delayMicroseconds(lowTime);
    }
  }


  digitalWrite(pinA, LOW);
  digitalWrite(pinB, LOW);
}


// =====================================================
// ALL MOTORS SIMULTANEOUSLY
// =====================================================

void playAllMotors(float durationSeconds) {

  // Opposite direction pins always LOW
  digitalWrite(NOTE5_B, LOW);
  digitalWrite(NOTE7_B, LOW);
  digitalWrite(NOTE2_B, LOW);
  digitalWrite(NOTE4_B, LOW);


  // Convert percentages to microseconds
  unsigned int note5OnTime =
    (PWM_PERIOD_US * NOTE5_POWER) / 100;

  unsigned int note7OnTime =
    (PWM_PERIOD_US * NOTE7_POWER) / 100;

  unsigned int note2OnTime =
    (PWM_PERIOD_US * NOTE2_POWER) / 100;

  unsigned int note4OnTime =
    (PWM_PERIOD_US * NOTE4_POWER) / 100;


  unsigned long durationMs =
    (unsigned long)(durationSeconds * 1000.0);

  unsigned long cycles =
    (durationMs * 1000UL) / PWM_PERIOD_US;


  for (unsigned long i = 0; i < cycles; i++) {

    unsigned long cycleStart = micros();


    // Turn motors ON
    if (NOTE5_POWER > 0)
      digitalWrite(NOTE5_A, HIGH);

    if (NOTE7_POWER > 0)
      digitalWrite(NOTE7_A, HIGH);

    if (NOTE2_POWER > 0)
      digitalWrite(NOTE2_A, HIGH);

    if (NOTE4_POWER > 0)
      digitalWrite(NOTE4_A, HIGH);


    bool note5Off = false;
    bool note7Off = false;
    bool note2Off = false;
    bool note4Off = false;


    // Control each motor independently
    while ((micros() - cycleStart) < PWM_PERIOD_US) {

      unsigned long elapsed =
        micros() - cycleStart;


      if (!note5Off && elapsed >= note5OnTime) {
        digitalWrite(NOTE5_A, LOW);
        note5Off = true;
      }


      if (!note7Off && elapsed >= note7OnTime) {
        digitalWrite(NOTE7_A, LOW);
        note7Off = true;
      }


      if (!note2Off && elapsed >= note2OnTime) {
        digitalWrite(NOTE2_A, LOW);
        note2Off = true;
      }


      if (!note4Off && elapsed >= note4OnTime) {
        digitalWrite(NOTE4_A, LOW);
        note4Off = true;
      }
    }


    // Ensure everything is LOW before next cycle
    digitalWrite(NOTE5_A, LOW);
    digitalWrite(NOTE7_A, LOW);
    digitalWrite(NOTE2_A, LOW);
    digitalWrite(NOTE4_A, LOW);
  }
}


// =====================================================
// STOP ALL MOTORS
// =====================================================

void stopAllMotors() {

  digitalWrite(NOTE5_A, LOW);
  digitalWrite(NOTE5_B, LOW);

  digitalWrite(NOTE7_A, LOW);
  digitalWrite(NOTE7_B, LOW);

  digitalWrite(NOTE2_A, LOW);
  digitalWrite(NOTE2_B, LOW);

  digitalWrite(NOTE4_A, LOW);
  digitalWrite(NOTE4_B, LOW);
}


// =====================================================
// EASY SECONDS DELAY
// =====================================================

void delaySeconds(float seconds) {

  delay((unsigned long)(seconds * 1000.0));
}
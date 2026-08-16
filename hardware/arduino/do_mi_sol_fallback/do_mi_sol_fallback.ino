#include <Arduino.h>
#include <stdlib.h>
#include <string.h>

// ======================================================
// PIN SETUP
// ======================================================

int sol1 = 3;
int sol2 = 5;

int mi1 = 9;
int mi2 = 10;

int do1 = 11;
int do2 = 12;


// ======================================================
// SETTINGS
// ======================================================

const int MOTOR_POWER = 100;        // 0-255
const unsigned long PULSE_MS = 180;

const unsigned long SERIAL_BAUD = 115200;

const int COMMAND_BUFFER_SIZE = 64;


// ======================================================
// SERIAL COMMAND BUFFER
// ======================================================

char commandBuffer[COMMAND_BUFFER_SIZE];
int commandLength = 0;


// ======================================================
// PULSE TIMERS
// ======================================================

bool doActive = false;
bool miActive = false;
bool solActive = false;

unsigned long doEndTime = 0;
unsigned long miEndTime = 0;
unsigned long solEndTime = 0;


// ======================================================
// ROUTINE
// ======================================================

bool routineRunning = false;
unsigned long routineStart = 0;
int routineStep = 0;
bool armed = false;


// ======================================================
// MOTOR CONTROL
// ======================================================

void stopDo() {
  analogWrite(do1, 0);
  digitalWrite(do2, LOW);

  doActive = false;
}

void stopMi() {
  analogWrite(mi1, 0);
  digitalWrite(mi2, LOW);

  miActive = false;
}

void stopSol() {
  analogWrite(sol1, 0);
  digitalWrite(sol2, LOW);

  solActive = false;
}

void allOff() {
  stopDo();
  stopMi();
  stopSol();
}


// ======================================================
// PLAY NOTES
// ======================================================

void playDo(unsigned long duration, int power = MOTOR_POWER) {

  digitalWrite(do2, LOW);
  analogWrite(do1, power);

  doActive = true;
  doEndTime = millis() + duration;

  Serial.println("PLAY: DO");
}

void playMi(unsigned long duration, int power = MOTOR_POWER) {

  digitalWrite(mi2, LOW);
  analogWrite(mi1, power);

  miActive = true;
  miEndTime = millis() + duration;

  Serial.println("PLAY: MI");
}

void playSol(unsigned long duration, int power = MOTOR_POWER) {

  digitalWrite(sol2, LOW);
  analogWrite(sol1, power);

  solActive = true;
  solEndTime = millis() + duration;

  Serial.println("PLAY: SOL");
}


// ======================================================
// PLAY CHORD
// ======================================================

void playChord(unsigned long duration) {

  playDo(duration);
  playMi(duration);
  playSol(duration);

  Serial.println("PLAY: DO + MI + SOL");
}


// ======================================================
// UPDATE MOTOR TIMERS
// ======================================================

void updateMotors() {

  unsigned long now = millis();

  if (doActive && (long)(now - doEndTime) >= 0) {
    stopDo();
  }

  if (miActive && (long)(now - miEndTime) >= 0) {
    stopMi();
  }

  if (solActive && (long)(now - solEndTime) >= 0) {
    stopSol();
  }
}


// ======================================================
// ROUTINE
//
// DO  = 1 second
// MI  = 2 seconds
// SOL = 3 seconds
// CHORD = 5 seconds
// ======================================================

void startRoutine() {

  allOff();

  routineRunning = true;
  routineStart = millis();
  routineStep = 0;

  Serial.println("ROUTINE STARTED");
}

void updateRoutine() {

  if (!routineRunning) {
    return;
  }

  unsigned long elapsed = millis() - routineStart;


  if (routineStep == 0 && elapsed >= 1000) {

    playDo(PULSE_MS);

    routineStep = 1;
  }


  if (routineStep == 1 && elapsed >= 2000) {

    playMi(PULSE_MS);

    routineStep = 2;
  }


  if (routineStep == 2 && elapsed >= 3000) {

    playSol(PULSE_MS);

    routineStep = 3;
  }


  if (routineStep == 3 && elapsed >= 5000) {

    playChord(PULSE_MS);

    routineStep = 4;
  }


  if (routineStep == 4 && elapsed >= 5500) {

    routineRunning = false;

    Serial.println("ROUTINE COMPLETE");
  }
}


// ======================================================
// WEBSITE CHANNEL MAPPING
//
// Channel 10 = DO
// Channel 12 = MI
// Channel 14 = SOL
//
// Website command:
//
// NOTE,10,180,1000
//
// channel,duration,strength
// ======================================================

void handleWebsiteNote(
  int channel,
  unsigned long duration,
  int strength
) {

  if (!armed) {
    Serial.println("ERROR,NOT_ARMED");
    return;
  }

  if (duration > PULSE_MS) {
    duration = PULSE_MS;
  }

  if (duration < 1) {
    return;
  }


  // Website strength is 0-1000
  // Arduino PWM is 0-255

  strength = constrain(strength, 0, 1000);

  int pwm = map(strength, 0, 1000, 0, 100);


  if (channel == 10) {

    playDo(duration, pwm);

  }

  else if (channel == 12) {

    playMi(duration, pwm);

  }

  else if (channel == 14) {

    playSol(duration, pwm);

  }

  else {

    Serial.println("ERROR,UNMAPPED_CHANNEL");

    return;
  }


  Serial.print("ACK,NOTE,");
  Serial.println(channel);
}


// ======================================================
// COMMAND HANDLER
// ======================================================



void handleCommand(char *command) {

  // Convert lowercase commands to uppercase

  for (int i = 0; command[i] != '\0'; i++) {

    if (command[i] >= 'a' && command[i] <= 'z') {

      command[i] =
        command[i] - ('a' - 'A');
    }
  }


  // ==================================================
  // WEBSITE CONNECTION
  // ==================================================

  if (strcmp(command, "HELLO,1") == 0) {

    Serial.println("READY,1,ACTIVE");

    return;
  }

  if (strncmp(command, "HELLO,", 6) == 0) {

    Serial.println("ERROR,PROTOCOL_VERSION");

    return;
  }


  // ==================================================
  // WEBSITE NOTE COMMAND
  // ==================================================

  if (strncmp(command, "NOTE,", 5) == 0) {

    char *channelText =
      strtok(command + 5, ",");

    char *durationText =
      strtok(NULL, ",");

    char *strengthText =
      strtok(NULL, ",");


    if (
      channelText == NULL ||
      durationText == NULL ||
      strengthText == NULL
    ) {

      Serial.println("ERROR,INVALID_NOTE");

      return;
    }


    int channel = atoi(channelText);

    unsigned long duration =
      strtoul(durationText, NULL, 10);

    int strength =
      atoi(strengthText);


    handleWebsiteNote(
      channel,
      duration,
      strength
    );

    return;
  }


  // ==================================================
  // EMERGENCY STOP
  // ==================================================

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


  // ==================================================
  // MANUAL TEST COMMANDS
  // ==================================================

  if (
    !armed &&
    (
      strcmp(command, "DO") == 0 ||
      strcmp(command, "MI") == 0 ||
      strcmp(command, "SOL") == 0 ||
      strcmp(command, "CHORD") == 0 ||
      strcmp(command, "RUN") == 0
    )
  ) {

    Serial.println("ERROR,NOT_ARMED");

    return;
  }

  if (strcmp(command, "DO") == 0) {

    playDo(PULSE_MS);

    return;
  }


  if (strcmp(command, "MI") == 0) {

    playMi(PULSE_MS);

    return;
  }


  if (strcmp(command, "SOL") == 0) {

    playSol(PULSE_MS);

    return;
  }


  if (strcmp(command, "CHORD") == 0) {

    playChord(PULSE_MS);

    return;
  }


  if (strcmp(command, "RUN") == 0) {

    startRoutine();

    return;
  }


  if (strcmp(command, "STATUS") == 0) {

    Serial.print("STATUS: READY, armed=");
    Serial.println(armed ? "true" : "false");

    return;
  }


  Serial.println("ERROR,UNKNOWN_COMMAND");
}


// ======================================================
// SERIAL READER
// ======================================================

void readSerial() {

  while (Serial.available() > 0) {

    char incoming = Serial.read();


    if (
      incoming == '\n' ||
      incoming == '\r'
    ) {

      if (commandLength > 0) {

        commandBuffer[commandLength] = '\0';

        handleCommand(commandBuffer);

        commandLength = 0;
      }

      continue;
    }


    if (commandLength < COMMAND_BUFFER_SIZE - 1) {

      commandBuffer[commandLength] = incoming;

      commandLength++;
    }

    else {

      commandLength = 0;

      Serial.println("ERROR,COMMAND_TOO_LONG");
    }
  }
}


// ======================================================
// SETUP
// ======================================================

void setup() {

  pinMode(sol1, OUTPUT);
  pinMode(sol2, OUTPUT);

  pinMode(mi1, OUTPUT);
  pinMode(mi2, OUTPUT);

  pinMode(do1, OUTPUT);
  pinMode(do2, OUTPUT);


  allOff();


  Serial.begin(SERIAL_BAUD);

  Serial.println("ANGKLUNG CONTROLLER READY; OUTPUTS DISARMED");
  Serial.println("Commands: ARM DO MI SOL CHORD RUN STOP DISARM");
}


// ======================================================
// LOOP
// ======================================================

void loop() {

  readSerial();

  updateMotors();

  updateRoutine();
}

#include <algorithm>
#include <cassert>
#include <cstring>
#include <iostream>
#include <string>

#include "../mega_full_18_note.ino"

void sendCommand(const std::string &text) {
  char command[COMMAND_BUFFER_SIZE];
  assert(text.size() < sizeof(command));
  std::strcpy(command, text.c_str());
  Serial.output.clear();
  handleCommand(command);
}

void assertAllOutputsLow() {
  for (uint8_t channel = 0; channel < CHANNEL_COUNT; channel++) {
    assert(fakePinValues[IN1_PINS[channel]] == LOW);
    assert(fakePinValues[IN2_PINS[channel]] == LOW);
  }
}

int main() {
  setup();
  assert(!armed);
  assertAllOutputsLow();
  assert(Serial.output.find("ANGKLOBOT FULL 18 READY - OUTPUTS DISARMED") != std::string::npos);

  sendCommand("HELLO,1");
  assert(Serial.output == "READY,1,ACTIVE\n");
  assert(!armed);
  assertAllOutputsLow();

  sendCommand("TEST,0");
  assert(Serial.output == "ERROR,NOT_ARMED\n");
  assertAllOutputsLow();

  sendCommand("POWER,0,61");
  assert(Serial.output == "ERROR,INVALID_POWER\n");
  assert(motorPowerPercent[0] == 20);
  sendCommand("POWER,0,35");
  assert(Serial.output == "ACK,POWER,0,35\n");
  assert(motorPowerPercent[0] == 35);
  assertAllOutputsLow();

  sendCommand("PULSE,0,181");
  assert(Serial.output == "ERROR,INVALID_PULSE\n");
  assert(motorPulseMs[0] == 120);
  sendCommand("PULSE,0,140");
  assert(Serial.output == "ACK,PULSE,0,140\n");
  assert(motorPulseMs[0] == 140);
  assertAllOutputsLow();

  sendCommand("CAL,0");
  assert(Serial.output == "CAL,0,G3,ANGKLUNG=5,POWER=35,PULSE=140,IN1=6,IN2=7\n");

  sendCommand("ARM");
  assert(Serial.output == "ACK,ARM\n");
  assert(armed);
  assertAllOutputsLow();

  fakeMillis = 10;
  fakeMicros = 10000;
  sendCommand("TEST,0");
  assert(Serial.output == "ACK,TEST,0,POWER=35,PULSE=140\n");
  assert(motors[0].active);
  assert(motors[0].dutyPermille == 350);
  updateSoftwarePwm();
  assert(fakePinValues[6] == HIGH);
  for (uint8_t channel = 1; channel < CHANNEL_COUNT; channel++) {
    assert(fakePinValues[IN1_PINS[channel]] == LOW);
  }

  fakeMillis = 150;
  updateMotorPulseExpiry();
  assertAllOutputsLow();

  fakeMillis = 200;
  fakeMicros = 200000;
  sendCommand("NOTE,17,180,800");
  assert(Serial.output == "ACK,NOTE,17\n");
  assert(motors[17].active);
  assert(motors[17].dutyPermille == 160);
  updateSoftwarePwm();
  assert(fakePinValues[46] == HIGH);
  assert(fakePinValues[47] == LOW);

  sendCommand("NOTE,18,180,800");
  assert(Serial.output == "ERROR,INVALID_CHANNEL\n");
  sendCommand("NOTE,0,NOPE,800");
  assert(Serial.output == "ERROR,INVALID_DURATION\n");

  sendCommand("CALALL");
  assertAllOutputsLow();
  assert(armed);
  assert(Serial.output.find("CAL,0,G3,ANGKLUNG=5,POWER=35,PULSE=140,IN1=6,IN2=7\n") == 0);
  assert(Serial.output.find("CAL,17,C6,ANGKLUNG=1,POWER=20,PULSE=120,IN1=46,IN2=47\n") != std::string::npos);
  assert(std::count(Serial.output.begin(), Serial.output.end(), '\n') == CHANNEL_COUNT);

  sendCommand("DISARM");
  assert(Serial.output == "ACK,DISARM\n");
  assert(!armed);
  assertAllOutputsLow();

  Serial.output.clear();
  Serial.input = "STATUS\r\n";
  readSerial();
  assert(Serial.output == "STATUS,READY,PROTOCOL=1,MODE=FULL18,ARMED=FALSE\n");

  std::cout << "firmware protocol and calibration tests passed\n";
  return 0;
}

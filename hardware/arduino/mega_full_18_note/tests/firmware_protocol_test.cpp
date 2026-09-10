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
    if (fakePinValues[IN1_PINS[channel]] != LOW || fakePinValues[IN2_PINS[channel]] != LOW) {
      std::cerr << "channel " << static_cast<int>(channel)
                << " remained active at millis=" << fakeMillis
                << " sweepActive=" << sweepActive << '\n';
    }
    assert(fakePinValues[IN1_PINS[channel]] == LOW);
    assert(fakePinValues[IN2_PINS[channel]] == LOW);
  }
}

int main() {
  setup();
  const uint8_t initialPower = motorPowerPercent[0];
  const uint16_t initialPulse = motorPulseMs[0];
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

  sendCommand("SWEEP");
  assert(Serial.output == "ERROR,NOT_ARMED\n");
  assert(!sweepActive);
  assertAllOutputsLow();

  sendCommand("POWER,0,61");
  assert(Serial.output == "ERROR,INVALID_POWER\n");
  assert(motorPowerPercent[0] == initialPower);
  sendCommand("POWER,0,35");
  assert(Serial.output == "ACK,POWER,0,35\n");
  assert(motorPowerPercent[0] == 35);
  assertAllOutputsLow();

  sendCommand("PULSE,0,181");
  assert(Serial.output == "ERROR,INVALID_PULSE\n");
  assert(motorPulseMs[0] == initialPulse);
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
  sendCommand("SWEEP");
  assert(Serial.output == "ACK,SWEEP\n");
  for (uint8_t channel = 0; channel < CHANNEL_COUNT; channel++) {
    assert(sweepActive);
    assert(sweepChannel == channel);
    assert(motors[channel].active);
    assert(motors[channel].dutyPermille == (uint16_t)motorPowerPercent[channel] * 10U);
    fakeMicros = motors[channel].pwmCycleStartUs;
    updateSoftwarePwm();
    assert(fakePinValues[IN1_PINS[channel]] == HIGH);
    assert(fakePinValues[IN2_PINS[channel]] == LOW);
    fakeMillis = motors[channel].pulseEndMs;
    updateMotorPulseExpiry();
    updateSweep();
    assert(fakePinValues[IN1_PINS[channel]] == LOW);
    assert(fakePinValues[IN2_PINS[channel]] == LOW);
  }
  assert(!sweepActive);
  assert(Serial.output == "ACK,SWEEP\nACK,SWEEP,DONE\n");
  assertAllOutputsLow();

  sendCommand("SWEEP");
  assert(sweepActive);
  sendCommand("ALL_OFF");
  assert(Serial.output == "ACK,ALL_OFF\n");
  assert(!sweepActive);
  assertAllOutputsLow();

  fakeMillis += 10;
  fakeMicros += 10000;
  sendCommand("SWEEP");
  assert(sweepActive);
  sendCommand("TEST,0");
  assert(Serial.output == "ACK,TEST,0,POWER=35,PULSE=140\n");
  assert(!sweepActive);
  assert(motors[0].active);
  assert(motors[0].dutyPermille == 350);
  updateSoftwarePwm();
  assert(fakePinValues[6] == HIGH);
  for (uint8_t channel = 1; channel < CHANNEL_COUNT; channel++) {
    assert(fakePinValues[IN1_PINS[channel]] == LOW);
  }

  fakeMillis = motors[0].pulseEndMs;
  updateMotorPulseExpiry();
  assertAllOutputsLow();

  fakeMillis += 50;
  fakeMicros = fakeMillis * 1000UL;
  sendCommand("SWEEP");
  assert(sweepActive);
  sendCommand("NOTE,17,180,800");
  assert(Serial.output == "ACK,NOTE,17\n");
  assert(!sweepActive);
  assert(motors[17].active);
  assert(
    motors[17].dutyPermille ==
    (uint32_t)motorPowerPercent[17] * 10U * 800U / 1000U
  );
  updateSoftwarePwm();
  assert(fakePinValues[IN1_PINS[17]] == HIGH);
  assert(fakePinValues[IN2_PINS[17]] == LOW);

  sendCommand("NOTE,18,180,800");
  assert(Serial.output == "ERROR,INVALID_CHANNEL\n");
  sendCommand("NOTE,0,NOPE,800");
  assert(Serial.output == "ERROR,INVALID_DURATION\n");

  sendCommand("CALALL");
  assertAllOutputsLow();
  assert(armed);
  assert(Serial.output.find("CAL,0,G3,ANGKLUNG=5,POWER=35,PULSE=140,IN1=6,IN2=7\n") == 0);
  const std::string expectedLastCalibration =
    "CAL,17,C6,ANGKLUNG=1,POWER=" + std::to_string(motorPowerPercent[17]) +
    ",PULSE=" + std::to_string(motorPulseMs[17]) +
    ",IN1=" + std::to_string(IN1_PINS[17]) +
    ",IN2=" + std::to_string(IN2_PINS[17]) + "\n";
  assert(Serial.output.find(expectedLastCalibration) != std::string::npos);
  assert(std::count(Serial.output.begin(), Serial.output.end(), '\n') == CHANNEL_COUNT);

  sendCommand("SWEEP");
  assert(sweepActive);
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

#include <cassert>
#include <cstring>
#include <iostream>
#include "../mega_full_18_note_web_serial.ino"

void send(const char *line) {
  char buffer[64];
  strcpy(buffer, line);
  Serial.output.clear();
  handleCommand(buffer);
}
void off() {
  for (int i = 0; i < 18; ++i) {
    assert(!motors[i].active);
    assert(fakePinValues[IN1_PINS[i]] == LOW);
    assert(fakePinValues[IN2_PINS[i]] == LOW);
  }
}
int main() {
  setup(); assert(!armed); off();
  send("HELLO,1"); assert(Serial.output == "READY,1,ACTIVE\n"); assert(!armed);
  send("HELLO,2"); assert(Serial.output == "ERROR,PROTOCOL_VERSION\n");
  send("NOTE,0,300,1000"); assert(Serial.output == "ERROR,NOT_ARMED\n"); off();
  send("ARM"); assert(armed); off();
  for (int i=0; i<18; ++i) {
    assert(motorPowerPercent[i] == 30); assert(motorPulseMs[i] == 550);
    std::string note = "NOTE," + std::to_string(i) + ",5000,1000";
    send(note.c_str()); assert(motors[i].active);
    assert(motors[i].dutyPermille == 300);
    assert(motors[i].pulseEndMs == fakeMillis + 700);
  }
  send("ALL_OFF"); assert(armed); off();
  send("NOTE,0,300,500"); send("NOTE,1,200,1000");
  assert(motors[0].active && motors[1].active);
  assert(motors[0].dutyPermille == 150);
  updateSoftwarePwm(); assert(fakePinValues[6] == HIGH);
  fakeMicros=150; updateSoftwarePwm(); assert(fakePinValues[6] == LOW);
  fakeMillis=100; send("NOTE,0,550,1000"); assert(motors[0].pulseEndMs == 650);
  fakeMillis=200; updateMotorPulseExpiry(); assert(!motors[1].active && motors[0].active);
  fakeMillis=650; updateMotorPulseExpiry(); off();
  for (const char *bad : {"NOTE,-1,300,1000", "NOTE,18,300,1000", "NOTE,0,0,1000", "NOTE,0,5001,1000", "NOTE,0,300,1001", "NOTE,0,,1000", "NOTE,0,300,1000,", "NOTE,0,300,9999999999999999999"}) {
    send(bad); assert(Serial.output.find("ERROR,") == 0); off();
  }
  for (const char *stop : {"STOP", "DISARM", "ESTOP"}) {
    send("ARM"); send("NOTE,0,300,1000"); updateSoftwarePwm();
    send(stop); off(); assert(armed == (strcmp(stop,"STOP") == 0));
  }
  std::cout << "USB firmware host tests passed (physical pin conflict unverified)\n";
}

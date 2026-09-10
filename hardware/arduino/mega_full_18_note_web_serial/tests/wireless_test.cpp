#include <cassert>
#include <cstring>
#include <iostream>
#include "../mega_full_18_note_web_serial.ino"
void run(FakeSerial &port, const char *line) {
  port.output.clear(); port.input += std::string(line) + "\n";
  while (port.available()) loop();
}
int main() {
  setup();
  assert(!armed && owner == OWNER_NONE && Serial1.output.empty());
  const uint8_t in1[] = {6,8,2,4,28,26,32,30,12,10,24,22,36,34,41,38,44,42};
  const uint8_t in2[] = {7,9,3,5,29,27,33,31,14,11,25,23,37,35,42,39,45,43};
  assert(memcmp(in1, IN1_PINS, 18) == 0 && memcmp(in2, IN2_PINS, 18) == 0);
  Serial.output.clear();
  run(Serial1, "HELLO,1"); assert(Serial1.output == "READY,1,ACTIVE\n" && Serial.output.empty());
  run(Serial1, "PING"); assert(Serial1.output == "PONG\n");
  run(Serial, "ARM"); run(Serial1, "ARM"); assert(Serial1.output == "ERROR,CONTROLLER_BUSY\n");
  run(Serial1, "NOTE,0,300,1000"); assert(!motors[0].active);
  run(Serial1, "ALL_OFF"); assert(!armed && owner == OWNER_NONE);
  run(Serial1, "ARM"); assert(owner == OWNER_UART);
  run(Serial, "ARM"); assert(Serial.output == "ERROR,CONTROLLER_BUSY\n");
  run(Serial, "NOTE,0,300,1000"); assert(!motors[0].active);
  run(Serial1, "ALLON"); assert(Serial1.output == "ERROR,WIRELESS_COMMAND_NOT_ALLOWED\n");
  run(Serial1, "CALIBRATE"); assert(!calibrationMode);
  run(Serial1, "NOTE,0,300,1000"); assert(Serial1.output == "ACK,NOTE,0\n");
  assert(motors[0].active && motors[0].dutyPermille == 300);
  fakeMillis = 300; loop(); assert(!motors[0].active);
  run(Serial1, "NOTE,0,5000,1000"); fakeMillis += 5000; loop(); assert(!motors[0].active);
  fakeMillis += 1000; run(Serial1, "PING"); assert(!armed && owner == OWNER_NONE);
  run(Serial1, "ARM"); run(Serial1, "NOTE,0,300,1000");
  run(Serial, "ESTOP"); assert(!armed && !motors[0].active && owner == OWNER_NONE);
  // Interleaved partial lines remain isolated between ports.
  Serial.input = "HEL"; Serial1.input = "STA"; loop();
  Serial.input = "LO,1\n"; Serial1.input = "TUS\n"; Serial.output.clear(); Serial1.output.clear(); loop();
  assert(Serial.output == "READY,1,ACTIVE\n"); assert(Serial1.output.find("STATUS,READY,") == 0);
  std::string overlong(100, 'X'); run(Serial1, overlong.c_str());
  assert(Serial1.output == "ERROR,COMMAND_TOO_LONG\n");
  run(Serial1, "ARM");
  for (const char *bad : {"NOTE,18,300,1000", "NOTE,0,5001,1000", "NOTE,0,300,1001", "NOTE,0,,1000", "NOTE,0,300,1000,"}) {
    run(Serial1,bad); assert(Serial1.output.find("ERROR,") == 0 && !motors[0].active);
  }
  run(Serial1,"ALL_OFF"); assert(armed && owner == OWNER_UART);
  run(Serial1,"DISARM"); assert(!armed && owner == OWNER_NONE);
  std::cout << "Dual transport ownership, routing, limits, lease and pin preservation passed\n";
}

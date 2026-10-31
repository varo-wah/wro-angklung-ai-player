#include <cassert>
#include <iostream>
#include "../angklobot_bridge.ino"
void usb(const char *s) { Serial.input += s; readUsb(); }
void reply(const char *s) { megaUart.input += s; readMega(); }
int main() {
  setup(); nowMs = 6500; WiFi.state = 0;
  usb("USB,1,HELLO,1\n"); assert(owner == Owner::USB);
  reply("READY,1,ACTIVE\n"); assert(!fault);
  assert(usbOutput.find("USB,1,200,READY,1,ACTIVE") != std::string::npos);
  auto before = megaUart.output;
  dispatch(0, "ARM"); assert(megaUart.output == before); // Wi-Fi cannot interleave.
  usb("USB,2,ARM\n"); reply("ACK,ARM\n");
  usb("USB,3,NOTE,0,100,800\n");
  usb("USB,4,ESTOP\n");
  assert(megaUart.output.substr(megaUart.output.size()-6) == "ESTOP\n");
  assert(usbOutput.find("USB,3,409,BRIDGE,PREEMPTED_BY_STOP") != std::string::npos);
  reply("ACK,NOTE,0\n"); assert(pending == -104);
  reply("ACK,DISARM\n"); assert(!wirelessMayBeArmed && pending == -1);
  usb("USB,5,USB,RELEASE\n"); assert(owner == Owner::NONE);
  nowMs += 6500;
  dispatch(0, "HELLO,1"); reply("READY,1,ACTIVE\n"); assert(owner == Owner::WIFI);
  before = megaUart.output; usb("USB,6,ARM\n"); assert(before == megaUart.output);
  usb("USB,7,ESTOP\n"); assert(owner == Owner::NONE && fault);
  reply("ACK,DISARM\n"); nowMs += 6500;
  usb("USB,8,HELLO,1\n"); reply("READY,1,ACTIVE\n");
  usb("USB,9,SCHED,BEGIN,9,1\n");
  usb("USB,10,SCHED,ADD,9,0,0:0:100:800\n");
  usb("USB,11,ARM\n"); reply("ACK,ARM\n");
  usb("USB,12,SCHED,RUN,9\n"); nowMs = startsAt; loop();
  assert(scheduleRunning && nextNote == 1 && pending == -2); // Works without Wi-Fi.
  reply("ACK,NOTE,0\n"); nowMs += 100; loop(); reply("ACK,DISARM\n");
  assert(!scheduleRunning && !wirelessMayBeArmed);
  before = megaUart.output; usb("ARM\nUSB,0,ARM\n"); assert(before == megaUart.output);
  Serial.input = "USB,13," + std::string(3100,'A') + "\n";
  while (Serial.available()) readUsb(); assert(before == megaUart.output);
  usb("USB,14,ARM\n"); reply("ACK,ARM\n");
  nowMs = ownerAt + OWNER_LEASE_MS + 1; loop();
  assert(fault && owner == Owner::NONE && !wirelessMayBeArmed);
  // Responses larger than a USB packet are drained without blocking or truncating.
  usbOutput = "USB,99,200," + std::string(120,'x') + "\n";
  Serial.output.clear(); Serial.writeSpace = 8;
  while (usbOutput.length()) loop();
  assert(Serial.output.find(std::string(120,'x')) != std::string::npos);
  std::cout << "USB framing, transport exclusion, immediate STOP, offline schedules, lease and bounded TX passed\n";
}

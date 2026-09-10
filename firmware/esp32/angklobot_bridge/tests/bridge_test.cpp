#include <cassert>
#include <iostream>
#include "../angklobot_bridge.ino"
std::shared_ptr<SocketData> slot(int i, const String &body, const String &token=BRIDGE_TOKEN) {
  auto socket=std::make_shared<SocketData>();
  clients[i].socket.data=socket; clients[i].waiting=false;
  clients[i].request="POST /command HTTP/1.1\r\nAuthorization: Bearer "+token+
    "\r\nContent-Length: "+std::to_string(body.length())+"\r\n\r\n"+body;
  return socket;
}
void reply(const char *s) { megaUart.input+=s; readMega(); }
int main() {
  setup(); assert(megaUart.output.empty());
  Serial.writeSpace = 0; // Run the entire bridge test without USB logging capacity.
  auto s=slot(0,"ARM\n","wrong"); parseRequest(0);
  assert(s->output.find("401")!=std::string::npos && megaUart.output.empty());
  s=slot(0,"ARM\n"); parseRequest(0); assert(s->output.find("503")!=std::string::npos);
  nowMs=6500; s=slot(0,"HELLO,1\n"); parseRequest(0);
  assert(megaUart.output=="HELLO,1\n"); reply("READY,1,ACTIVE\n"); assert(!fault);
  s=slot(0,"ARM\n"); parseRequest(0); reply("ACK,ARM\n"); assert(wirelessMayBeArmed);
  auto note=slot(0,"NOTE,0,300,1000\n"); parseRequest(0);
  auto busy=slot(1,"NOTE,1,300,1000\n"); parseRequest(1);
  assert(busy->output.find("409")!=std::string::npos);
  auto stop=slot(1,"ESTOP\n"); parseRequest(1);
  assert(note->output.find("PREEMPTED")!=std::string::npos);
  reply("ERROR,INVALID_NOTE\n"); assert(stop->output.empty());
  reply("ACK,DISARM\n"); assert(stop->output.find("ACK,DISARM")!=std::string::npos);
  assert(fault && !wirelessMayBeArmed);
  nowMs+=6500; s=slot(0,"HELLO,1\n"); parseRequest(0); reply("READY,1,ACTIVE\n");
  for (const char *bad : {"NOTE,0,300,1000\nARM\n", "ALLON\n", "CALIBRATE\n"}) {
    auto before=megaUart.output; s=slot(0,bad); parseRequest(0); assert(megaUart.output==before);
  }
  s=slot(0,"ARM\n"); parseRequest(0); nowMs+=751; loop();
  assert(fault && megaUart.output.substr(megaUart.output.size()-7)=="DISARM\n");
  nowMs+=6500; s=slot(0,"HELLO,1\n"); parseRequest(0); reply("READY,1,ACTIVE\n");
  s=slot(0,"ARM\n"); parseRequest(0); reply("ACK,ARM\n");
  wasConnected=true; WiFi.state=0; loop(); assert(fault && !wirelessMayBeArmed);
  std::cout<<"Bridge authentication, framing, busy bound, stop priority, reply correlation and failures passed\n";
}

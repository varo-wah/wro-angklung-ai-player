#pragma once
#include "Arduino.h"
#include <memory>
struct SocketData { bool live=true; std::string input, output; };
class WiFiClient {
 public:
  std::shared_ptr<SocketData> data;
  bool connected() const { return data && data->live; }
  explicit operator bool() const { return connected(); }
  void stop() { if(data) data->live=false; }
  int available() const { return data ? data->input.size() : 0; }
  char read() { char c=data->input.front(); data->input.erase(0,1); return c; }
  template<class... T> void printf(const char *fmt,T... args) { char b[512]; snprintf(b,sizeof(b),fmt,args...); if(data) data->output+=b; }
  void print(const String &s) { if(data) data->output+=s; }
  void print(char c) { if(data) data->output+=c; }
};
class WiFiServer {
 public:
  explicit WiFiServer(int) {}
  void begin() {}
  WiFiClient available() { return {}; }
};
#define WIFI_STA 1
#define WL_CONNECTED 3
struct Address : String { Address():String("192.168.1.2") {} String toString() { return *this; } };
struct FakeWiFi {
  int state=WL_CONNECTED;
  int status() { return state; }
  void mode(int) {} void setAutoReconnect(bool) {} void begin(const char*,const char*) {}
  Address localIP() { return {}; }
};
inline FakeWiFi WiFi;

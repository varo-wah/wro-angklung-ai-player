#pragma once
#include <algorithm>
#include <cctype>
#include <cstdint>
#include <cstring>
#include <cstdlib>
#include <string>
#include <cstdio>
class String : public std::string {
 public:
  using std::string::string;
  explicit String(int value): std::string(std::to_string(value)) {}
  String(const std::string &s): std::string(s) {}
  bool startsWith(const String &s) const { return rfind(s, 0) == 0; }
  bool endsWith(const String &s) const { return size() >= s.size() && compare(size()-s.size(), s.size(), s)==0; }
  int indexOf(const String &s, size_t from=0) const { auto p=find(s,from); return p==npos ? -1 : (int)p; }
  int indexOf(char c, size_t from=0) const { auto p=find(c,from); return p==npos ? -1 : (int)p; }
  String substring(size_t a, size_t b=npos) const { return substr(a, b==npos ? npos : b-a); }
  void remove(size_t a) { erase(a); }
  void toLowerCase() { for (char &c:*this) c=std::tolower((unsigned char)c); }
  long toInt() const { return std::strtol(c_str(), nullptr, 10); }
};
inline unsigned long nowMs=0;
inline unsigned long millis() { return nowMs; }
inline void delay(unsigned long ms) { nowMs+=ms; }
inline bool isDigit(char c) { return c>='0' && c<='9'; }
#define SERIAL_8N1 0
class HardwareSerial {
 public:
  std::string input, output;
  int writeSpace = 512;
  explicit operator bool() const { return true; }
  int availableForWrite() { return writeSpace; }
  explicit HardwareSerial(int=0) {}
  void begin(unsigned long, int=0, int=0, int=0) {}
  int available() { return input.size(); }
  char read() { char c=input.front(); input.erase(0,1); return c; }
  void print(int value) { output+=std::to_string(value); }
  template<class T> void print(const T &s) { output+=s; }
  template<class T> void println(const T &s) { print(s); output+='\n'; }
};
inline HardwareSerial Serial;

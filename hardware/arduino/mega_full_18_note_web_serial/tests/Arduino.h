#pragma once

#include <cstdint>
#include <sstream>
#include <string>

using uint8_t = std::uint8_t;
using uint16_t = std::uint16_t;
using uint32_t = std::uint32_t;

#define HIGH 1
#define LOW 0
#define OUTPUT 1
#define F(value) value

inline unsigned long fakeMillis = 0;
inline unsigned long fakeMicros = 0;
inline int fakePinValues[64] = {};

inline unsigned long millis() { return fakeMillis; }
inline unsigned long micros() { return fakeMicros; }
inline void pinMode(uint8_t, int) {}
inline void digitalWrite(uint8_t pin, int value) { fakePinValues[pin] = value; }

template <typename T>
T min(T left, T right) {
  return left < right ? left : right;
}

struct FakeSerial {
  std::string input;
  std::string output;

  void begin(unsigned long) {}
  int available() const { return static_cast<int>(input.size()); }
  char read() {
    const char value = input.front();
    input.erase(0, 1);
    return value;
  }

  void print(const char *value) { output += value; }
  void print(char value) { output += value; }
  void print(uint8_t value) { output += std::to_string(value); }
  void print(uint16_t value) { output += std::to_string(value); }
  void print(long value) { output += std::to_string(value); }
  void print(unsigned long value) { output += std::to_string(value); }

  template <typename T>
  void println(T value) {
    print(value);
    output += '\n';
  }
};

inline FakeSerial Serial;

using Print = FakeSerial;
using Stream = FakeSerial;
inline FakeSerial Serial1;

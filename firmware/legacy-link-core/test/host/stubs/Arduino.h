#pragma once
#include <cstddef>
#include <cstdint>
#include <cstdio>
#include <cstring>
#include <string>
#include <ctime>
#include <vector>
using byte = unsigned char;
#define HIGH 1
#define LOW 0
#define OUTPUT 1
inline int &gpio_output_pin() { static int pin = -1; return pin; }
inline std::vector<int> &gpio_levels() { static std::vector<int> levels; return levels; }
inline void pinMode(int pin, int) { gpio_output_pin() = pin; }
inline void digitalWrite(int, int level) { gpio_levels().push_back(level); }
extern unsigned long test_millis;
inline unsigned long millis() { return test_millis; }
inline void delay(unsigned long value) { test_millis += value; }
inline unsigned &time_sync_calls() { static unsigned calls = 0; return calls; }
inline void configTime(long, int, const char *, const char *) { ++time_sync_calls(); }
struct TestEsp {
  uint64_t getEfuseMac() { return 0x123456789ABCULL; }
  unsigned getFreeHeap() { return 200000; }
};
extern TestEsp ESP;
#define SERIAL_8E2 1
#define SERIAL_8E1 2
#define SERIAL_8O2 3
#define SERIAL_8O1 4
#define SERIAL_8N2 5
#define SERIAL_8N1 6
inline size_t strlcpy(char *dest, const char *src, size_t size) {
  const size_t length = strlen(src);
  if (size) { const size_t count = length < size - 1 ? length : size - 1;
    memcpy(dest, src, count); dest[count] = '\0'; }
  return length;
}
struct TestSerial {
  unsigned begin_count = 0;
  std::string input;
  size_t cursor = 0;
  void feed(const std::string &text) { input = text; cursor = 0; }
  int available() { return cursor < input.size(); }
  int read() { return input[cursor++]; }
  void begin(uint32_t) { ++begin_count; }
  size_t setRxBufferSize(size_t size) { return size; }
  void begin(uint32_t, uint32_t, int, int) { ++begin_count; }
  void println() {}
  void println(int) {}
  void print(const char *) {}
  void println(const char *) {}
  template <typename... Args> void printf(const char *, Args...) {}
};
extern TestSerial Serial;
extern TestSerial Serial2;

#pragma once
#include <cstddef>
#include <cstdint>
#include <cstdio>
#include <cstring>
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
  void begin(uint32_t, uint32_t, int, int) { ++begin_count; }
  void println(const char *) {}
  template <typename... Args> void printf(const char *, Args...) {}
};
extern TestSerial Serial;
extern TestSerial Serial2;

#pragma once
#include <Arduino.h>
inline unsigned &modbus_read_calls() { static unsigned calls = 0; return calls; }
inline uint16_t &modbus_address() { static uint16_t address = 0; return address; }
inline uint16_t &modbus_words() { static uint16_t words = 0; return words; }
inline uint16_t *modbus_response() { static uint16_t words[2] = {0xFFFF, 0xFFFF}; return words; }
inline uint8_t &modbus_error() { static uint8_t error = 0; return error; }
inline unsigned &modbus_wait_ms() { static unsigned value = 0; return value; }
inline void (*&modbus_wait_hook())() { static void (*hook)() = nullptr; return hook; }
struct ModbusMaster {
  static constexpr uint8_t ku8MBSuccess = 0;
  void (*idle_callback)() = nullptr;
  void (*pre_callback)() = nullptr;
  void (*post_callback)() = nullptr;
  void idle(void (*callback)()) { idle_callback = callback; }
  void preTransmission(void (*callback)()) { pre_callback = callback; }
  void postTransmission(void (*callback)()) { post_callback = callback; }
  void begin(uint8_t, TestSerial &) {}
  uint8_t readHoldingRegisters(uint16_t address, uint16_t words) {
    ++modbus_read_calls(); modbus_address() = address; modbus_words() = words;
    if (pre_callback) pre_callback();
    if (post_callback) post_callback();
    const unsigned long started = millis();
    while (millis() - started < modbus_wait_ms()) {
      if (modbus_wait_hook()) modbus_wait_hook()();
      if (idle_callback) idle_callback(); else delay(1);
    }
    return modbus_error();
  }
  uint8_t readInputRegisters(uint16_t address, uint16_t words) { return readHoldingRegisters(address, words); }
  uint16_t getResponseBuffer(uint8_t index) { return modbus_response()[index]; }
};

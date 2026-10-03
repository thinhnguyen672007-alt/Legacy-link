#pragma once
#include <Arduino.h>
inline unsigned &modbus_read_calls() { static unsigned calls = 0; return calls; }
struct ModbusMaster {
  static constexpr uint8_t ku8MBSuccess = 0;
  void begin(uint8_t, TestSerial &) {}
  uint8_t readHoldingRegisters(uint16_t, uint16_t) { ++modbus_read_calls(); return ku8MBSuccess; }
  uint8_t readInputRegisters(uint16_t, uint16_t) { ++modbus_read_calls(); return ku8MBSuccess; }
  uint16_t getResponseBuffer(uint8_t) { return 0xFFFF; }
};

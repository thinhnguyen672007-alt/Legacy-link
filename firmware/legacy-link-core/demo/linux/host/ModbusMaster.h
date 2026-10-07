#pragma once
// Demo-only transport: real Modbus RTU frames over a Linux pseudo-terminal.
// Firmware decoding stays in src/modbus_reader.cpp. This is not the ESP32 driver.
#include <Arduino.h>
#include <chrono>
#include <cstdlib>
#include <fcntl.h>
#include <poll.h>
#include <termios.h>
#include <unistd.h>

struct ModbusMaster {
  static constexpr uint8_t ku8MBSuccess = 0;
  int fd = -1;
  uint8_t slave = 1;
  uint16_t response[2] = {};
  void (*idle_callback)() = nullptr;
  void (*pre_callback)() = nullptr;
  void (*post_callback)() = nullptr;
  ~ModbusMaster() { if (fd >= 0) close(fd); }
  void idle(void (*callback)()) { idle_callback = callback; }
  void preTransmission(void (*callback)()) { pre_callback = callback; }
  void postTransmission(void (*callback)()) { post_callback = callback; }
  void begin(uint8_t id, TestSerial &) {
    slave = id;
    if (fd >= 0) return;
    const char *path = getenv("LEGACYLINK_DEMO_UART");
    if (!path) return;
    fd = open(path, O_RDWR | O_NOCTTY | O_NONBLOCK);
    if (fd < 0) return;
    termios settings{};
    if (tcgetattr(fd, &settings) == 0) {
      cfmakeraw(&settings);
      cfsetispeed(&settings, B9600); cfsetospeed(&settings, B9600);
      tcsetattr(fd, TCSANOW, &settings);
    }
  }
  static uint16_t crc(const uint8_t *data, size_t length) {
    uint16_t value = 0xffff;
    for (size_t i = 0; i < length; ++i) {
      value ^= data[i];
      for (unsigned b = 0; b < 8; ++b)
        value = value & 1 ? (value >> 1) ^ 0xa001 : value >> 1;
    }
    return value;
  }
  uint8_t transaction(uint8_t function, uint16_t address, uint16_t words) {
    if (fd < 0 || words == 0 || words > 2) return 0xe2;
    uint8_t request[8] = {slave, function, uint8_t(address >> 8), uint8_t(address),
                          uint8_t(words >> 8), uint8_t(words), 0, 0};
    const auto check = crc(request, 6);
    request[6] = check; request[7] = check >> 8;
    tcflush(fd, TCIFLUSH);
    if (pre_callback) pre_callback();
    if (write(fd, request, sizeof(request)) != static_cast<ssize_t>(sizeof(request))) return 0xe2;
    if (post_callback) post_callback();
    uint8_t reply[16] = {}; size_t received = 0;
    const auto deadline = std::chrono::steady_clock::now() + std::chrono::seconds(2);
    while (std::chrono::steady_clock::now() < deadline) {
      pollfd ready{fd, POLLIN, 0};
      if (poll(&ready, 1, 10) > 0) {
        const auto count = read(fd, reply + received, sizeof(reply) - received);
        if (count > 0) received += count;
      }
      if (received >= 3) {
        const size_t expected = reply[1] & 0x80 ? 5 : size_t(reply[2]) + 5;
        if (expected > sizeof(reply)) return 0xe3;
        if (received >= expected) {
          const auto sum = crc(reply, expected - 2);
          if (reply[expected - 2] != uint8_t(sum) || reply[expected - 1] != uint8_t(sum >> 8)) return 0xe3;
          if (reply[0] != slave || (reply[1] & 0x7f) != function) return 0xe0;
          if (reply[1] & 0x80) return reply[2];
          if (reply[2] != words * 2) return 0xe3;
          for (uint16_t i = 0; i < words; ++i) response[i] = (uint16_t(reply[3 + 2*i]) << 8) | reply[4 + 2*i];
          return ku8MBSuccess;
        }
      }
      if (idle_callback) { test_millis += 10; idle_callback(); }
    }
    return 0xe2;
  }
  uint8_t readHoldingRegisters(uint16_t address, uint16_t words) { return transaction(3, address, words); }
  uint8_t readInputRegisters(uint16_t address, uint16_t words) { return transaction(4, address, words); }
  uint16_t getResponseBuffer(uint8_t index) { return response[index]; }
};

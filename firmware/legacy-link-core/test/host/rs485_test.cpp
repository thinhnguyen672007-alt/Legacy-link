#include "modbus_reader.h"
#include "gateway_settings.h"
#include <ModbusMaster.h>
#include <cassert>
#include <iostream>

TestSerial Serial, Serial2;
unsigned long test_millis = 0;
static void check_receive_mode() { assert(gpio_levels().back() == LOW); }

int main() {
  static_assert(LEGACYLINK_RS485_DE_RE_PIN == 23, "Run with manual direction enabled");
  modbus_init(1);
  assert(gpio_output_pin() == 23 && gpio_levels().back() == LOW);
  device_config_t config = {};
  config.slave_id = 1; config.register_count = 1;
  auto &reg = config.registers[0];
  strcpy(reg.key, "temperature"); strcpy(reg.data_type, "INT16");
  reg.function_code = 3; reg.scale = 1;
  modbus_result_t result = {};
  modbus_wait_ms() = 100;
  modbus_wait_hook() = check_receive_mode;
  assert(modbus_read_one(&config, 0, &result));
  assert((gpio_levels() == std::vector<int>{LOW, HIGH, LOW}));
  modbus_error() = 0xE2;
  assert(!modbus_read_one(&config, 0, &result));
  assert((gpio_levels() == std::vector<int>{LOW, HIGH, LOW, HIGH, LOW}));
  std::cout << "Manual RS-485 direction returns to receive mode before success or timeout.\n";
}

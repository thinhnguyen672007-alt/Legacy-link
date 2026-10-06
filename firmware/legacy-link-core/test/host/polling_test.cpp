#include "../../src/main.cpp"
#include <ModbusMaster.h>
#include <cassert>
#include <iostream>

TestSerial Serial, Serial2;
TestEsp ESP;
unsigned long test_millis = 0;
static bool injected = false;
static unsigned uart_before = 0;
static void receive_during_poll() {
  if (injected) return;
  injected = true;
  mqttClient.receive(config_topic, R"({"deviceId":"NEW","registerMap":[{"key":"temperature","address":51,"dataType":"INT16"}]})");
  assert(config_pending);
  assert(std::string(global_device_config.device_id) == "OLD");
  assert(Serial2.begin_count == uart_before); // No UART reconfiguration mid-frame.
}

int main() {
  setup(); reconnect_mqtt();
  DynamicJsonDocument doc(8192);
  doc["deviceId"] = "OLD";
  JsonArray registers = doc.createNestedArray("registerMap");
  for (int i = 0; i < MAX_REGISTERS; ++i) {
    JsonObject reg = registers.createNestedObject();
    reg["key"] = std::string("m") + std::to_string(i);
    reg["address"] = i;
  }
  std::string config; serializeJson(doc, config);
  assert(apply_runtime_config(config.c_str()));
  modbus_error() = 0xE2;
  modbus_wait_ms() = 2000;
  mqttClient.loops = 0;
  mqttClient.max_loop_gap = 0;
  const unsigned long started = millis();
  const auto reads = modbus_read_calls();
  for (int i = 0; i < MAX_REGISTERS; ++i) {
    loop();
    assert(modbus_read_calls() == reads + i + 1); // One transaction per iteration.
  }
  assert(millis() - started == 32000);
  assert(mqttClient.loops > 3000 && mqttClient.max_loop_gap <= 10);
  assert(mqttClient.connected());
  for (const auto &message : mqttClient.published)
    assert(message.topic != "legacy-link/devices/OLD/telemetry");

  // Apply a new map received during a read only at the next loop boundary.
  modbus_error() = 0;
  reset_poll_cycle();
  uart_before = Serial2.begin_count;
  modbus_wait_hook() = receive_during_poll;
  loop();
  assert(config_pending && poll_active && poll_index == 1);
  modbus_wait_hook() = nullptr;
  mqttClient.published.clear();
  loop();
  assert(std::string(global_device_config.device_id) == "NEW");
  assert(modbus_address() == 51 && !poll_active);
  unsigned telemetry_count = 0;
  for (const auto &message : mqttClient.published) {
    if (message.topic.find("/telemetry") == std::string::npos) continue;
    ++telemetry_count;
    assert(message.topic == "legacy-link/devices/NEW/telemetry");
    assert(!deserializeJson(doc, message.payload));
    assert(doc["metrics"].size() == 1 && doc["metrics"].containsKey("temperature"));
  }
  assert(telemetry_count == 1);

  // Scan scheduling survives the 32-bit millis rollover.
  modbus_wait_ms() = 0;
  poll_active = false;
  last_poll_started = 0xFFFFFF00UL;
  test_millis = 743;
  const auto calls = modbus_read_calls();
  poll_modbus_step(); assert(modbus_read_calls() == calls);
  test_millis = 744;
  poll_modbus_step(); assert(modbus_read_calls() == calls + 1);
  std::cout << "32-second timeout scan preserves MQTT service; deferred config and rollover tests passed.\n";
}

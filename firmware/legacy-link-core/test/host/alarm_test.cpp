#include "config_parser.h"
#include "alarm_monitor.h"
#include <ArduinoJson.h>
#include <cassert>
#include <iostream>
#include <limits>
#include <string>

TestSerial Serial, Serial2;
unsigned long test_millis = 0;
static unsigned attempts = 0;
static bool send_ok = true;
static bool send_alarm(const device_config_t *cfg, const alarm_config_t *alarm,
                       double value, uint64_t timestamp) {
  assert(std::string(cfg->device_id) == "CNC-01");
  assert(std::string(alarm->code) == "OVERHEAT" || std::string(alarm->code) == "UNDERHEAT");
  assert(std::string(alarm->severity) == "high");
  assert((alarm->below ? value < alarm->threshold : value > alarm->threshold) && timestamp > 0);
  ++attempts;
  return send_ok;
}

int main() {
  const char *config = R"({"deviceId":"CNC-01","registerMap":[{"key":"temperature","address":0,"alarm":{"threshold":80,"hysteresis":5,"code":"OVERHEAT","severity":"high"}}]})";
  assert(apply_new_configuration(config));
  const auto before = global_device_config;
  const auto calls = Serial2.begin_count;
  const char *invalid_alarms[] = {
    "null", "[]", "{}", "false",
    R"({"threshold":"80","code":"OVERHEAT","severity":"high"})",
    R"({"threshold":true,"code":"OVERHEAT","severity":"high"})",
    R"({"threshold":1e100,"code":"OVERHEAT","severity":"high"})",
    R"({"threshold":80,"hysteresis":-1,"code":"OVERHEAT","severity":"high"})",
    R"({"threshold":80,"hysteresis":null,"code":"OVERHEAT","severity":"high"})",
    R"({"threshold":80,"code":"UNKNOWN","severity":"high"})",
    R"({"threshold":80,"code":"OVERHEAT","severity":"urgent"})",
    R"({"threshold":80,"code":"OVERHEAT"})",
  };
  for (const char *invalid : invalid_alarms) {
    DynamicJsonDocument doc(2048), alarm(1024);
    assert(!deserializeJson(doc, config));
    assert(!deserializeJson(alarm, invalid));
    doc["registerMap"][0]["alarm"] = alarm.as<JsonVariant>();
    std::string json; serializeJson(doc, json);
    assert(!apply_new_configuration(json.c_str()));
    assert(is_config_valid && Serial2.begin_count == calls);
    assert(memcmp(&before, &global_device_config, sizeof(before)) == 0);
  }

  AlarmMonitor monitor;
  modbus_result_t reading = {};
  strcpy(reading.key, "temperature"); reading.success = true;
  auto sample = [&](float value, uint64_t timestamp = 1) {
    reading.scaled_value = value;
    monitor.evaluate(&global_device_config, &reading, 1, timestamp, send_alarm);
  };
  sample(80); assert(attempts == 0); // strict upper boundary
  sample(81, 0); assert(attempts == 0); // wait for synchronized clock
  send_ok = false; sample(81); assert(attempts == 1);
  send_ok = true; sample(82); assert(attempts == 2); // retry failed send
  sample(100); sample(78); sample(81); assert(attempts == 2);
  reading.success = false; sample(0); reading.success = true;
  sample(std::numeric_limits<float>::quiet_NaN());
  sample(std::numeric_limits<float>::infinity());
  sample(81); assert(attempts == 2); // invalid readings never rearm
  sample(75); sample(81); assert(attempts == 3);
  monitor.reset(); sample(81); assert(attempts == 4);
  strcpy(reading.key, "other"); sample(0);
  strcpy(reading.key, "temperature"); sample(81); assert(attempts == 4);

  // Separate registers retain separate state, even with reordered readings.
  global_device_config.register_count = 2;
  global_device_config.registers[1] = global_device_config.registers[0];
  strcpy(global_device_config.registers[1].key, "second");
  modbus_result_t pair[2] = {reading, reading};
  strcpy(pair[0].key, "second");
  monitor.reset();
  monitor.evaluate(&global_device_config, pair, 2, 1, send_alarm);
  assert(attempts == 6);
  pair[0].scaled_value = 75;
  monitor.evaluate(&global_device_config, pair, 2, 1, send_alarm);
  pair[0].scaled_value = 81;
  monitor.evaluate(&global_device_config, pair, 2, 1, send_alarm);
  assert(attempts == 7);

  // All supported codes and severities parse, and alarm remains optional.
  const char *codes[] = {"OVERHEAT", "OVERCURRENT", "OVERSPEED", "VIBRATION"};
  const char *severities[] = {"low", "medium", "high", "critical"};
  DynamicJsonDocument full(16384);
  full["deviceId"] = "CNC-01";
  JsonArray registers = full.createNestedArray("registerMap");
  for (int i = 0; i < MAX_REGISTERS; ++i) {
    JsonObject reg = registers.createNestedObject();
    reg["key"] = std::string("m") + std::to_string(i); reg["address"] = i;
    JsonObject alarm = reg.createNestedObject("alarm");
    alarm["threshold"] = 80; alarm["code"] = codes[i % 4];
    alarm["severity"] = severities[i / 4];
  }
  std::string json; serializeJson(full, json);
  assert(json.size() < 4096 && apply_new_configuration(json.c_str()));
  assert(global_device_config.register_count == MAX_REGISTERS);
  assert(global_device_config.registers[15].alarm.enabled);
  assert(global_device_config.registers[15].alarm.hysteresis == 0);
  assert(apply_new_configuration(R"({"deviceId":"CNC-01","registerMap":[{"key":"x","address":0}]})"));
  assert(!global_device_config.registers[0].alarm.enabled);
  // Ngưỡng thấp: báo <20, hồi phục >=23; lỗi đọc không được hồi phục giả.
  assert(apply_new_configuration(R"({"deviceId":"CNC-01","registerMap":[{"key":"temperature","address":0,"unit":"C","lowAlarm":{"threshold":20,"hysteresis":3,"code":"UNDERHEAT","severity":"high"}}]})"));
  monitor.reset(); attempts = 0;
  reading.success = true; strcpy(reading.key, "temperature");
  sample(20); assert(attempts == 0);
  sample(19); assert(attempts == 1);
  sample(21); sample(19); assert(attempts == 1);
  reading.success = false; sample(25); reading.success = true;
  sample(19); assert(attempts == 1);
  sample(23); sample(19); assert(attempts == 2);
  assert(!apply_new_configuration(R"({"deviceId":"CNC-01","registerMap":[{"key":"temperature","address":0,"unit":"C","lowAlarm":{"threshold":20,"hysteresis":-3,"code":"UNDERHEAT","severity":"high"}}]})"));
  assert(!apply_new_configuration(R"({"deviceId":"CNC-01","registerMap":[{"key":"temperature","address":0,"unit":"C","alarm":{"threshold":20,"code":"OVERHEAT","severity":"high"},"lowAlarm":{"threshold":20,"code":"UNDERHEAT","severity":"high"}}]})"));
  std::cout << "Alarm validation, threshold, hysteresis and retry tests passed.\n";
}

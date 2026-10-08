// Capture JSON produced by the real firmware serializers for backend validation.
#include "../../src/main.cpp"
#include <cassert>
#include <fstream>
#include <iostream>
#include <iterator>
#include <string>

TestSerial Serial, Serial2;
TestEsp ESP;
unsigned long test_millis = 0;

int main(int argc, char **argv) {
  assert(argc == 2);
  std::ifstream input(argv[1]);
  assert(input.good());
  std::string json((std::istreambuf_iterator<char>(input)), std::istreambuf_iterator<char>());
  setup();
  reconnect_mqtt();
  mqttClient.receive(config_topic, json);
  loop();
  assert(is_config_valid);
  telemetry_queue = TelemetryQueue{};
  mqttClient.published.clear();

  modbus_result_t readings[MAX_REGISTERS] = {};
  const uint8_t count = modbus_poll_and_collect(&global_device_config, readings, MAX_REGISTERS);
  publish_telemetry(&global_device_config, readings, count);
  publish_status(&global_device_config, true);
  publish_status(&global_device_config, false);

  const char *codes[] = {"OVERHEAT", "OVERCURRENT", "OVERSPEED", "VIBRATION"};
  const char *severities[] = {"low", "medium", "high", "critical"};
  for (const char *code : codes) {
    for (const char *severity : severities) {
      auto &alarm = global_device_config.registers[0].alarm;
      alarm = {};
      strcpy(alarm.code, code);
      strcpy(alarm.severity, severity);
      alarm_queue = AlarmQueue{};
      assert(publish_alarm(&global_device_config, &alarm, 81.5f, current_epoch_ms()));
    }
  }
  assert(mqttClient.published.size() == 19);
  for (const auto &sent : mqttClient.published) {
    DynamicJsonDocument envelope(4096);
    envelope["topic"] = sent.topic;
    envelope["retained"] = sent.retained;
    envelope["payload"] = sent.payload;
    std::string line;
    serializeJson(envelope, line);
    std::cout << line << '\n';
  }
}

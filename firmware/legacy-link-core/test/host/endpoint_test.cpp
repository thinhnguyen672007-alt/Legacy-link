#include "../../src/main.cpp"
#include <ModbusMaster.h>
#include <cassert>
#include <iostream>
#include <fstream>
#include <iterator>
#include <vector>

TestSerial Serial, Serial2;
TestEsp ESP;
unsigned long test_millis = 0;
static std::vector<std::string> alarms;
static bool accept_alarm(const device_config_t *, const alarm_config_t *alarm, double, uint64_t) {
  alarms.push_back(std::string(alarm->below ? "below:" : "above:") + alarm->severity);
  return true;
}

int main() {
  for (const char *name : {"esp32-01", "esp32-03"}) {
    const std::string source = __FILE__;
    const std::string path = source.substr(0, source.find_last_of('/')) + "/../../examples/" + name + ".json";
    std::ifstream file(path);
    assert(file.good());
    const std::string json((std::istreambuf_iterator<char>(file)), std::istreambuf_iterator<char>());
    assert(apply_new_configuration(json.c_str()));
    assert(std::string(global_device_config.device_id) == name);
    assert(global_device_config.register_count == 3);
    assert(std::string(global_device_config.registers[1].key) == "torque");
    assert(global_device_config.registers[2].address == (std::string(name) == "esp32-01" ? 49 : 51));
    modbus_result_t readings[3] = {};
    assert(modbus_poll_and_collect(&global_device_config, readings, 3) == 3);
    assert(readings[2].success && readings[2].scaled_value < 0);
  }
  const char *endpoint = R"({"deviceId":"CNC-01","registers":[{"metric_key":"temperature","protocol_address":49,"modicon_address":40050,"function_code":4,"data_type":"INT16","scale":0.1,"unit":"C","alarm": {"threshold":90,"criticalThreshold":100,"hysteresis":3,"code":"OVERHEAT","severity":"high"}}]})";
  assert(apply_new_configuration(endpoint));
  modbus_result_t result = {};
  modbus_poll_and_collect(&global_device_config, &result, 1);
  assert(modbus_address() == 49 && modbus_words() == 1);
  assert(result.success && result.scaled_value < 0);
  const auto before = global_device_config;
  const char *bad[] = {
    R"({"deviceId":"CNC-01","registers":[]})",
    R"({"deviceId":"CNC-01","registerMap":[],"registers":[{"metric_key":"x","protocol_address":0}]})",
    R"({"deviceId":"CNC-01","registers":[{"metric_key":"x","address":0}]})",
    R"({"deviceId":"CNC-01","registers":[{"metric_key":"x","protocol_address":0,"dataType":"UINT16"}]})",
    R"({"deviceId":"CNC-01","registers":[{"metric_key":"x","protocol_address":0,"data_type":"FLOAT32"}]})",
    R"({"deviceId":"CNC-01","registers":[{"metric_key":"x","protocol_address":65535,"data_type":"UINT32"}]})",
    R"({"deviceId":"CNC-01","registers":[{"metric_key":"x","protocol_address":0,"word_order":"INVALID"}]})",
    R"({"deviceId":"CNC-01","registers":[{"metric_key":"x","modicon_address":40050}]})",
    R"({"deviceId":"CNC-01","registers":[{"metric_key":"x","protocol_address":0,"alarm_high":90}]})",
    R"({"deviceId":"CNC-01","registers":[{"metric_key":"x","protocol_address":0,"alarm_low":10}]})",
    R"({"deviceId":"CNC-01","registers":[{"metric_key":"x","protocol_address":0,"alarm_high":90,"alarm_critical":80,"alarm_code":"OVERHEAT"}]})",
    R"({"deviceId":"CNC-01","registers":[{"metric_key":"x","protocol_address":0,"alarm_high":90,"alarm_low":95,"alarm_code":"OVERHEAT","alarm_low_code":"VIBRATION"}]})"
  };
  for (auto json : bad) {
    assert(!apply_new_configuration(json));
    assert(!memcmp(&before, &global_device_config, sizeof(before)));
  }
  AlarmMonitor monitor;
  auto sample = [&](double value) {
    result.scaled_value = value;
    monitor.evaluate(&global_device_config, &result, 1, 1, accept_alarm);
  };
  sample(91); sample(101); sample(99); sample(101);
  assert((alarms == std::vector<std::string>{"above:high", "above:critical"}));
  sample(97); sample(101); assert(alarms.size() == 3);
  monitor.reset(); alarms.clear(); sample(105); sample(95);
  assert((alarms == std::vector<std::string>{"above:critical"}));
  sample(87); sample(91); assert(alarms.back() == "above:high");

  assert(apply_new_configuration(R"({"deviceId":"CNC-01","registers":[{"metric_key":"temperature","protocol_address":49,"alarm_high":90,"alarm_critical":100,"alarm_code":"OVERHEAT","alarm_hysteresis":3}]})"));
  monitor.reset(); alarms.clear(); sample(91); sample(101);
  assert((alarms == std::vector<std::string>{"above:high", "above:critical"}));

  // Low threshold is independent of high-threshold hysteresis. The explicit
  // code here is a supported contract code, not a proposed under-temperature code.
  assert(apply_new_configuration(R"({"deviceId":"CNC-01","registers":[{"metric_key":"temperature","protocol_address":49,"alarm_low":10,"alarm_low_code":"VIBRATION","alarm_hysteresis":3}]})"));
  monitor.reset(); alarms.clear();
  sample(9); sample(11); sample(9); assert(alarms.size() == 1);
  sample(13); sample(9); assert(alarms.size() == 2 && alarms.back() == "below:high");

  assert(apply_new_configuration(R"({"deviceId":"CNC-01","registers":[{"metric_key":"rpm","protocol_address":49,"data_type":"UINT32","word_order":"HIGH_FIRST"}]})"));
  modbus_response()[0] = 0x1234; modbus_response()[1] = 0x5678;
  modbus_poll_and_collect(&global_device_config, &result, 1);
  assert(modbus_words() == 2 && result.scaled_value == 0x12345678UL);
  global_device_config.registers[0].low_word_first = true;
  modbus_poll_and_collect(&global_device_config, &result, 1);
  assert(result.scaled_value == 0x56781234UL);
  modbus_response()[0] = modbus_response()[1] = 0xFFFF;
  modbus_poll_and_collect(&global_device_config, &result, 1);
  assert(result.scaled_value == 4294967295.0);
  modbus_error() = 0xE2;
  modbus_poll_and_collect(&global_device_config, &result, 1);
  assert(!result.success);
  modbus_error() = 0;

  setup(); reconnect_mqtt();
  assert(mqttClient.client_id == "legacy-link-CNC-01-123456789ABC");
  assert(mqttClient.will_topic == "legacy-link/devices/CNC-01/status");
  assert(mqttClient.will_retained && mqttClient.will_qos == 1);
  DynamicJsonDocument will(512);
  assert(!deserializeJson(will, mqttClient.will_payload));
  assert(will["deviceId"] == "CNC-01" && will["status"] == false);
  assert(will["schemaVersion"] == 1 && will["timestamp"].as<uint64_t>() > 1700000000000ULL);
  const auto connections = mqttClient.connections;
  mqttClient.receive(device_config_topic, endpoint); loop();
  mqttClient.receive(device_config_topic, endpoint); loop();
  assert(mqttClient.connections == connections); // retained config cannot cause reconnect storms
  assert(!apply_runtime_config(R"({"deviceId":"OTHER","registers":[{"metric_key":"x","protocol_address":0}]})", true));
  assert(std::string(global_device_config.device_id) == "CNC-01");
  assert(apply_runtime_config(R"({"deviceId":"OTHER","registers":[{"metric_key":"x","protocol_address":0}]})"));
  assert(mqttClient.client_id == "legacy-link-OTHER-123456789ABC");
  assert(mqttClient.will_topic == "legacy-link/devices/OTHER/status");
  bool old_offline = false;
  for (const auto &message : mqttClient.published) {
    if (message.topic != "legacy-link/devices/CNC-01/status") continue;
    assert(!deserializeJson(will, message.payload));
    if (will["status"] == false && message.retained) old_offline = true;
  }
  assert(old_offline);
  std::cout << "Endpoint fields, UINT32, alarm levels, scoped config and Last Will tests passed.\n";
}

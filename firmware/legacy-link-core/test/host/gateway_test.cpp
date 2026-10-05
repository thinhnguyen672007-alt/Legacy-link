// Exercise the actual setup, callback and loop with deterministic hardware stubs.
#include "../../src/main.cpp"
#include <cassert>
#include <iostream>
#include <limits>

TestSerial Serial, Serial2;
TestEsp ESP;
unsigned long test_millis = 0;

const char *valid_config = R"({"deviceId":"CNC-01","registerMap":[{"key":"temperature","address":100}]})";

int main() {
  setup();
  assert(mqttClient.callback != nullptr);
  assert(mqttClient.buffer_size >= CONFIG_BUFFER_SIZE + strlen(config_topic) + 5);
  assert(std::string(config_topic) == "legacy-link/gateways/123456789ABC/config");
  reconnect_mqtt();
  assert(mqttClient.client_id == "legacy-link-123456789ABC");
  assert(mqttClient.subscribed_topic == config_topic);
  assert(mqttClient.subscriptions == 1);

  mqttClient.receive("legacy-link/gateways/other/config", valid_config);
  assert(!config_pending && !is_config_valid);
  mqttClient.receive(config_topic, valid_config);
  assert(config_pending && !is_config_valid); // callback only copies bytes
  loop(); // input storage in receive() has already been destroyed
  assert(!config_pending && is_config_valid);
  assert(Serial2.begin_count == 1);
  assert(std::string(global_device_config.device_id) == "CNC-01");

  const device_config_t before = global_device_config;
  for (const std::string &invalid : {
      std::string(), std::string(CONFIG_BUFFER_SIZE, 'x'), std::string("{}\0extra", 8),
      std::string("{"), std::string(R"({"deviceId":"bad","slaveId":257,"registerMap":[{"key":"x","address":0}]})")}) {
    mqttClient.receive(config_topic, invalid);
    loop();
    assert(memcmp(&before, &global_device_config, sizeof(before)) == 0);
    assert(Serial2.begin_count == 1);
  }

  // Each reconnect restores the exact subscription; failed writes retry later.
  mqttClient.disconnect();
  reconnect_mqtt();
  assert(mqttClient.subscriptions == 5);
  mqttClient.disconnect(); mqttClient.subscribe_ok = false;
  reconnect_mqtt();
  assert(!mqttClient.connected());
  mqttClient.subscribe_ok = true;
  test_millis += 5000; loop();
  assert(mqttClient.connected() && mqttClient.subscriptions == 8);

  // A valid-looking suffix of an overflowing Serial line must not be applied.
  Serial.feed(std::string(CONFIG_BUFFER_SIZE, 'x') + valid_config + "\n");
  loop(); assert(Serial2.begin_count == 1);
  Serial.feed(std::string("\0", 1) + valid_config + "\n");
  loop(); assert(Serial2.begin_count == 1);
  Serial.feed(std::string(valid_config) + "\r\n");
  loop(); assert(Serial2.begin_count == 1); // identical retained/Serial config is idempotent

  // MQTT delivery after a reboot can provision a gateway with no active config.
  is_config_valid = false; global_device_config = {};
  mqttClient.receive(config_topic, valid_config); loop();
  assert(is_config_valid && Serial2.begin_count == 2);

  modbus_result_t readings[MAX_REGISTERS] = {};
  for (int i = 0; i < MAX_REGISTERS; ++i) {
    snprintf(readings[i].key, sizeof(readings[i].key), "metric-long-name-%02d", i);
    readings[i].success = true;
    readings[i].scaled_value = 123456.75f;
  }
  mqttClient.published.clear();
  publish_telemetry(&global_device_config, readings, MAX_REGISTERS);
  assert(mqttClient.published.size() == 1);
  const auto &message = mqttClient.published[0];
  assert(message.payload.size() > 512); // regression: old buffer truncated JSON
  DynamicJsonDocument doc(4096);
  assert(!deserializeJson(doc, message.payload));
  assert(doc["metrics"].size() == MAX_REGISTERS);
  assert(doc["schemaVersion"] == 1 && doc["timestamp"].as<uint64_t>() > 0);
  assert(message.topic == "legacy-link/devices/CNC-01/telemetry" && !message.retained);
  for (auto &reading : readings) reading.success = false;
  publish_telemetry(&global_device_config, readings, MAX_REGISTERS);
  readings[0].success = true;
  readings[0].scaled_value = std::numeric_limits<float>::infinity();
  publish_telemetry(&global_device_config, readings, MAX_REGISTERS);
  assert(mqttClient.published.size() == 1);
  const char *alarm_config = R"({"deviceId":"CNC-01","registerMap":[{"key":"temperature","address":100,"dataType":"UINT16","alarm":{"threshold":65000,"hysteresis":100,"code":"OVERHEAT","severity":"high"}}]})";
  mqttClient.published.clear();
  mqttClient.receive(config_topic, alarm_config);
  test_millis += 1000; loop();
  auto alarm_count = [&]() {
    unsigned count = 0;
    for (const auto &sent : mqttClient.published) {
      if (sent.topic != "legacy-link/devices/CNC-01/alarm") continue;
      ++count;
      assert(!sent.retained);
      assert(!deserializeJson(doc, sent.payload));
      assert(doc.size() == 6);
      assert(doc["deviceId"] == "CNC-01" && doc["schemaVersion"] == 1);
      assert(doc["timestamp"].as<uint64_t>() > 1577836800000ULL);
      assert(doc["code"] == "OVERHEAT" && doc["severity"] == "high");
      assert(doc["value"].as<float>() == 65535.0f);
    }
    return count;
  };
  assert(alarm_count() == 1);
  test_millis += 1000; loop(); assert(alarm_count() == 1);
  mqttClient.receive(config_topic, "{}");
  test_millis += 1000; loop(); assert(alarm_count() == 1);
  mqttClient.disconnect(); reconnect_mqtt();
  test_millis += 1000; loop(); assert(alarm_count() == 1);
  // Identical config does not rearm an already-notified alarm.
  Serial.feed(std::string(alarm_config) + "\n");
  mqttClient.publish_ok = false;
  test_millis += 1000; loop(); assert(alarm_count() == 1);
  mqttClient.publish_ok = true;
  test_millis += 1000; loop(); assert(alarm_count() == 1);
  std::cout << "Gateway lifecycle and telemetry tests passed.\n";
}

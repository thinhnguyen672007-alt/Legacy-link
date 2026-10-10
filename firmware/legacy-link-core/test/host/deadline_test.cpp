#include "../../src/main.cpp"
#include <Preferences.h>
#include <cassert>
#include <iostream>
TestSerial Serial, Serial2;
TestEsp ESP;
unsigned long test_millis = 0;
int main() {
  StaticJsonDocument<256> doc;
  assert(command_deadline_valid(doc, 0));
  for (const char *invalid : {"null", "true", "-1", "1.5", "\"99999\""}) {
    assert(!deserializeJson(doc, std::string("{\"expiresAt\":") + invalid + "}"));
    assert(!command_deadline_valid(doc, 100));
  }
  doc.clear(); doc["expiresAt"] = uint64_t(1000);
  assert(command_deadline_valid(doc, 999));
  assert(!command_deadline_valid(doc, 1000));
  assert(!command_deadline_valid(doc, 1001));
  assert(!command_deadline_valid(doc, 0));
  setup();
  assert(apply_runtime_config(R"({"deviceId":"A","registerMap":[{"key":"temperature","address":1}]})"));
  const auto before = global_device_config;
  const auto writes = storage_writes();
  // Simulate a command admitted earlier that expires before loop execution.
  for (bool probe : {false, true}) {
    strcpy(pending_config, R"({"deviceId":"B","requestId":"late","expiresAt":1,"registerMap":[{"key":"temperature","address":49}]})");
    pending_probe = probe; config_pending = true;
    loop();
    assert(!config_pending);
    assert(!memcmp(&before, &global_device_config, sizeof(before)));
    assert(storage_writes() == writes);
  }
  for (const char *field : {"requestId", "expectedBootId", "expectedConfigRequestId"}) {
    for (const char *value : {"null", "17", "true", "\"id\\u0000suffix\""}) {
      const std::string invalid = std::string("{\"") + field + "\":" + value + "}";
      mqttClient.receive(config_topic, invalid);
      assert(!config_pending);
      DynamicJsonDocument ack(1024); assert(!deserializeJson(ack, config_ack));
      assert(ack["reason"] == "invalid_payload");
    }
  }
  // The expected active profile can become stale after admission too.
  strcpy(active_request_id, "first");
  mqttClient.receive(config_topic, R"({"deviceId":"A","requestId":"next","expectedConfigRequestId":"first","registerMap":[{"key":"temperature","address":49}]})");
  assert(config_pending);
  strcpy(active_request_id, "another");
  loop();
  assert(!memcmp(&before, &global_device_config, sizeof(before)));
  DynamicJsonDocument ack(1024); assert(!deserializeJson(ack, config_ack));
  assert(ack["reason"] == "stale_command");
  // A busy rejection identifies the second request without replacing the first.
  mqttClient.receive(config_topic, R"({"deviceId":"A","requestId":"first","registerMap":[{"key":"temperature","address":1}]})");
  const std::string pending = pending_config;
  mqttClient.receive(config_topic, R"({"requestId":"second"})");
  assert(pending == pending_config && config_pending);
  assert(!deserializeJson(ack, config_ack));
  assert(ack["reason"] == "busy" && ack["requestId"] == "second");
  loop();
  std::cout << "Deadline types, boundary and deferred execution tests passed.\n";
}

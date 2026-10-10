#include "../../src/main.cpp"
#include <ModbusMaster.h>
#include <Preferences.h>
#include <cassert>
#include <iostream>
TestSerial Serial, Serial2;
TestEsp ESP;
unsigned long test_millis = 0;
static bool injected = false;
static void inject_while_probing() {
  if (injected) return;
  injected = true;
  const std::string before = pending_config;
  mqttClient.receive(config_topic, R"({"requestId":"competing"})");
  assert(config_pending && before == pending_config);
  DynamicJsonDocument ack(1024); assert(!deserializeJson(ack, config_ack));
  assert(ack["reason"] == "busy" && ack["requestId"] == "competing");
}
int main() {
  setup();
  const char *active = R"({"deviceId":"A","requestId":"apply-a","registerMap":[{"key":"temperature","address":0,"scale":0.1}]})";
  assert(apply_runtime_config(active));
  const auto before = global_device_config;
  const auto flash = saved_config_blob();
  const auto writes = storage_writes();
  const char *probe = R"({"deviceId":"B","requestId":"probe-b","baudRate":19200,"registerMap":[{"key":"temperature","address":49,"dataType":"INT16","scale":0.1}]})";
  modbus_response()[0] = static_cast<uint16_t>(-180);
  mqttClient.receive(probe_topic, probe);
  assert(config_pending && pending_probe);
  loop();
  assert(!memcmp(&before, &global_device_config, sizeof(before)));
  assert(saved_config_blob() == flash && storage_writes() == writes);
  assert(Serial2.last_baud_rate == before.baud_rate);
  bool found = false;
  for (const auto &msg : mqttClient.published) if (msg.topic == std::string(probe_topic) + "/result") {
    DynamicJsonDocument doc(4096); assert(!deserializeJson(doc, msg.payload));
    assert(doc["requestId"] == "probe-b" && doc["deviceId"] == "B");
    assert(doc["readings"][0]["address"] == 49);
    assert(doc["readings"][0]["rawWords"][0] == 65356);
    assert(doc["readings"][0]["rawValue"] == -180);
    assert(fabs(doc["readings"][0]["value"].as<double>() + 18) < .0001);
    assert(!msg.retained); found = true;
  }
  assert(found);
  const char *expired = R"({"deviceId":"A","requestId":"expired","expiresAt":1,"registerMap":[{"key":"temperature","address":9}]})";
  mqttClient.receive(config_topic, expired);
  assert(!config_pending);
  assert(!memcmp(&before, &global_device_config, sizeof(before)));
  DynamicJsonDocument rejected(1024);
  assert(!deserializeJson(rejected, config_ack) && rejected["reason"] == "stale_command");
  mqttClient.published.clear(); modbus_error() = 0x02;
  run_probe(probe);
  DynamicJsonDocument failed(4096);
  assert(!deserializeJson(failed, mqttClient.published.back().payload));
  assert(failed["readings"][0]["success"] == false && failed["readings"][0]["errorCode"] == 2);
  assert(!failed["readings"][0].containsKey("value"));
  assert(saved_config_blob() == flash);
  mqttClient.published.clear();
  test_millis += 2000; loop();
  bool diagnostic = false;
  for (const auto &msg : mqttClient.published) if (msg.topic == "legacy-link/devices/A/diagnostics") {
    assert(!deserializeJson(failed, msg.payload));
    assert(failed["readings"][0]["success"] == false); diagnostic = true;
  }
  assert(diagnostic); // All reads failed, but failure still reaches the backend.
  assert(restore_saved_configuration());
  publish_gateway_state();
  assert(!deserializeJson(failed, mqttClient.published.back().payload));
  assert(failed["restored"] == true && failed["configRequestId"] == "apply-a");
  modbus_error() = 0; modbus_wait_ms() = 100;
  modbus_wait_hook() = inject_while_probing;
  mqttClient.receive(probe_topic, probe); loop();
  modbus_wait_hook() = nullptr;
  assert(injected && !config_pending);
  assert(!memcmp(&before, &global_device_config, sizeof(before)));
  // A multi-register probe expires during its first slow transaction.
  DynamicJsonDocument slow(4096); assert(!deserializeJson(slow, probe));
  slow["expiresAt"] = current_epoch_ms() + 50;
  slow["registerMap"].as<JsonArray>().add(slow["registerMap"][0]);
  slow["registerMap"][1]["key"] = "second";
  std::string slowPayload; serializeJson(slow, slowPayload);
  mqttClient.published.clear();
  const unsigned calls = modbus_read_calls();
  run_probe(slowPayload.c_str());
  assert(modbus_read_calls() == calls + 1);
  assert(Serial2.last_baud_rate == before.baud_rate);
  assert(saved_config_blob() == flash);
  for (const auto &msg : mqttClient.published)
    assert(msg.topic != std::string(probe_topic) + "/result");
  assert(!deserializeJson(rejected, config_ack));
  assert(rejected["reason"] == "stale_command");
  // A failed local MQTT write must be observable rather than silently discarded.
  modbus_wait_ms() = 0; mqttClient.publish_ok = false;
  const auto drops = read_report_drops;
  run_probe(probe);
  assert(read_report_drops == drops + 1);
  assert(!deserializeJson(rejected, config_ack));
  assert(rejected["reason"] == "report_publish_failed" && rejected["requestId"] == "probe-b");
  assert(Serial2.last_baud_rate == before.baud_rate && saved_config_blob() == flash);
  std::cout << "Probe isolation, raw signed values, read failures and boot evidence passed.\n";
}

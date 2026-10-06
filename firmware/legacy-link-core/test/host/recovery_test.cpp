#include "../../src/main.cpp"
#include <Preferences.h>
#include <cassert>
#include <iostream>

TestSerial Serial, Serial2;
TestEsp ESP;
unsigned long test_millis = 0;
const char *config = R"({"deviceId":"CNC-01","requestId":"request-1","registerMap":[{"key":"temperature","address":49,"alarm":{"threshold":90,"code":"OVERHEAT","severity":"high"}}]})";

int main() {
  WiFi.connection_status = WL_DISCONNECTED;
  setup();
  assert(!is_config_valid);
  assert(apply_runtime_config(config));
  assert(active_config_persisted && storage_writes() == 1);
  const auto saved = saved_config_blob();
  DynamicJsonDocument ack(2048);
  assert(!deserializeJson(ack, config_ack));
  assert(ack["result"] == "applied" && ack["requestId"] == "request-1");
  assert(ack["persisted"] == true);
  assert(apply_runtime_config(config));
  assert(storage_writes() == 1); // Retained redelivery does not wear flash.
  assert(!deserializeJson(ack, config_ack) && ack["result"] == "unchanged");
  assert(!apply_runtime_config(R"({"deviceId":"CNC-01","requestId":"bad-request","registerMap":[]})"));
  assert(saved_config_blob() == saved);
  assert(!deserializeJson(ack, config_ack));
  assert(ack["result"] == "rejected" && ack["requestId"] == "bad-request");
  assert(!apply_runtime_config(R"({"deviceId":"CNC-01","requestId":12,"registerMap":[{"key":"x","address":0}]})"));
  assert(saved_config_blob() == saved);

  // Simulate rebooted RAM while keeping the NVS contents, with Wi-Fi unavailable.
  is_config_valid = false; global_device_config = {}; active_config_persisted = false;
  assert(restore_saved_configuration());
  assert(is_config_valid && active_config_persisted);
  assert(std::string(global_device_config.device_id) == "CNC-01");
  assert(global_device_config.registers[0].address == 49);
  assert(global_device_config.registers[0].alarm.enabled);
  assert(storage_writes() == 1 && !mqttClient.connected());

  // Flash failures are reported truthfully, and an unchanged retry can persist later.
  storage_write_ok() = false;
  const char *changed = R"({"deviceId":"CNC-01","requestId":"request-2","registerMap":[{"key":"temperature","address":51}]})";
  assert(apply_runtime_config(changed));
  assert(!active_config_persisted && saved_config_blob() == saved);
  assert(!deserializeJson(ack, config_ack));
  assert(ack["result"] == "applied" && ack["reason"] == "storage_error" && ack["persisted"] == false);
  storage_write_ok() = true;
  assert(apply_runtime_config(changed) && active_config_persisted);
  WiFi.connection_status = WL_CONNECTED;
  mqttClient.publish_ok = false;
  reconnect_mqtt();
  assert(config_ack_pending);
  mqttClient.publish_ok = true;
  flush_config_ack();
  assert(!config_ack_pending);
  const auto &message = mqttClient.published.back();
  assert(message.topic == "legacy-link/gateways/123456789ABC/config/ack" && !message.retained);
  assert(!deserializeJson(ack, message.payload));
  assert(ack["requestId"] == "request-2" && ack["persisted"] == true);

  // Corrupt, oversized, and semantically invalid saved data cannot replace active settings.
  const auto before = global_device_config;
  for (const auto &bytes : {std::vector<unsigned char>{'x'},
       std::vector<unsigned char>{'{', '}', '\0'},
       std::vector<unsigned char>{'{', '\0', '}', '\0'},
       std::vector<unsigned char>(MAX_CONFIG_PAYLOAD_BYTES + 2, 'x')}) {
    saved_config_blob() = bytes;
    assert(!restore_saved_configuration());
    assert(!memcmp(&before, &global_device_config, sizeof(before)));
  }
  storage_available() = false;
  assert(!restore_saved_configuration());
  std::cout << "Config persistence, corruption rejection, flash failure and correlated MQTT acknowledgement tests passed.\n";
}

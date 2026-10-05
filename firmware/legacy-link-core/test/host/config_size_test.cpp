// Check serialized byte limits separately from JSON document memory capacity.
#include "../../src/main.cpp"
#include <cassert>
#include <iostream>
#include <string>

TestSerial Serial, Serial2;
TestEsp ESP;
unsigned long test_millis = 0;

int main() {
  setup();
  reconnect_mqtt();
  DynamicJsonDocument doc(16384);
  doc["deviceId"] = "CNC-SIZE-TEST";
  doc["deviceName"] = std::string(MAX_DEVICE_NAME_LEN - 1, 'n');
  JsonArray registers = doc.createNestedArray("registerMap");
  for (int i = 0; i < MAX_REGISTERS; ++i) {
    JsonObject reg = registers.createNestedObject();
    char key[MAX_REG_KEY_LEN];
    snprintf(key, sizeof(key), "metric-long-name-%02d", i);
    assert(strlen(key) == MAX_REG_KEY_LEN - 1);
    reg["key"] = key;
    reg["address"] = i;
    reg["functionCode"] = 3;
    reg["dataType"] = "UINT32";
    reg["wordOrder"] = "LOW_FIRST";
    reg["scale"] = 0.1;
    reg["unit"] = "degrees";
  }
  std::string compact;
  serializeJson(doc, compact);
  assert(compact.size() <= MAX_CONFIG_PAYLOAD_BYTES);
  std::string maximum = compact + std::string(MAX_CONFIG_PAYLOAD_BYTES - compact.size(), ' ');
  std::string oversized = maximum + " "; // Valid JSON, but too many bytes.
  assert(apply_new_configuration(maximum.c_str()));
  assert(global_device_config.register_count == MAX_REGISTERS);
  const auto before = global_device_config;
  const auto uart_calls = Serial2.begin_count;
  assert(!apply_new_configuration(oversized.c_str()));
  assert(!memcmp(&before, &global_device_config, sizeof(before)));
  assert(Serial2.begin_count == uart_calls);

  // A 4095-byte message applies through MQTT and Serial; 4096 bytes are rejected.
  is_config_valid = false;
  mqttClient.receive(config_topic, maximum);
  assert(config_pending);
  loop();
  assert(is_config_valid && global_device_config.register_count == MAX_REGISTERS);
  mqttClient.receive(config_topic, oversized);
  assert(!config_pending);
  assert(!memcmp(&before, &global_device_config, sizeof(before)));
  is_config_valid = false;
  Serial.feed(maximum + "\n"); loop();
  assert(is_config_valid && global_device_config.register_count == MAX_REGISTERS);
  const auto calls_after_serial = Serial2.begin_count;
  Serial.feed(oversized + "\n"); loop();
  assert(Serial2.begin_count == calls_after_serial);
  assert(!memcmp(&before, &global_device_config, sizeof(before)));
  std::cout << "16-register config uses " << compact.size()
            << " bytes; 4095-byte input passes, 4096-byte input is rejected on all paths.\n";
}

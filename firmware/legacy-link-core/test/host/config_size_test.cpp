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
    snprintf(key, sizeof(key), "metric_long_name_%02d", i);
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
  // Full-sized read reports must fit the actual MQTT packet, including its topic.
  modbus_result_t results[MAX_REGISTERS] = {};
  for (uint8_t i = 0; i < MAX_REGISTERS; ++i) {
    results[i].success = true; results[i].word_count = 2;
    results[i].raw_words[0] = results[i].raw_words[1] = 65535;
    results[i].raw_value = 4294967295.0; results[i].scaled_value = 1.461e48;
    results[i].completed_at_ms = millis();
  }
  strcpy(global_device_config.device_id, "device_1234567890123456789012345");
  memset(active_request_id, 'a', 64); active_request_id[64] = 0;
  char request[65]; memset(request, 'r', 64); request[64] = 0;
  mqttClient.published.clear();
  send_read_report(global_device_config, results, request);
  assert(mqttClient.published.size() == 1);
  assert(!deserializeJson(doc, mqttClient.published.back().payload));
  assert(doc["readings"].size() == MAX_REGISTERS && doc["requestId"] == request);
  const auto reportBytes = mqttClient.published.back().payload.size();
  assert(reportBytes < 4096);
  // Diagnostics đầy đủ vẫn phải gửi được khi thêm bộ đếm delivery.
  mqttClient.published.clear();
  send_read_report(global_device_config, results);
  assert(mqttClient.published.size() == 1);
  assert(!deserializeJson(doc, mqttClient.published.back().payload));
  assert(doc["readings"].size() == MAX_REGISTERS && doc["delivery"]["storage"] == "RAM");
  assert(mqttClient.published.back().payload.size() < REPORT_BUFFER_SIZE);
  mqttClient.buffer_size = 256;
  assert(!mqttClient.publish("legacy-link/test/oversized", std::string(256, 'x').c_str()));
  std::cout << "Largest tested 16-register report: " << reportBytes << " bytes.\n";
  std::cout << "16-register config uses " << compact.size()
            << " bytes; 4095-byte input passes, 4096-byte input is rejected on all paths.\n";
}

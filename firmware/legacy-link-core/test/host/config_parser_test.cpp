#include <Arduino.h>
#include <ArduinoJson.h>
#include "config_parser.h"
#include "modbus_reader.h"
#include <cassert>
#include <iostream>
#include <string>

TestSerial Serial;
TestSerial Serial2;
unsigned long test_millis = 0;
const char *valid = R"({"deviceId":"CNC-01","registerMap":[{"key":"temperature","address":100}]})";

void rejected(const std::string &json) {
  const device_config_t before = global_device_config;
  const unsigned calls = Serial2.begin_count;
  assert(!apply_new_configuration(json.c_str()));
  assert(is_config_valid);
  assert(memcmp(&before, &global_device_config, sizeof(before)) == 0);
  assert(Serial2.begin_count == calls);
}

int main() {
  assert(!apply_new_configuration("{"));
  assert(!is_config_valid);
  assert(Serial2.begin_count == 0);
  assert(apply_new_configuration(valid));
  assert(is_config_valid && Serial2.begin_count == 1);
  assert(global_device_config.baud_rate == 9600);
  assert(global_device_config.slave_id == 1);
  assert(global_device_config.register_count == 1);

  for (const char *json : {"{", "null", "[]", "{}", "{\"deviceId\":\"x\"}"}) rejected(json);
  const char *invalid_fields[] = {
    R"("deviceId":"")", R"("deviceId":"bad/id")", R"("deviceId":"bad+id")",
    R"("deviceId":"bad#id")", R"("deviceId":"bad id")", R"("deviceId":42)",
    R"("deviceId":"1234567890123456789012345678901234")",
    R"("protocol":"OTHER")", R"("baudRate":0)", R"("baudRate":"9600")",
    R"("slaveId":257)", R"("slaveId":-1)", R"("slaveId":1.5)",
    R"("stopBits":3)", R"("parity":"MARK")", R"("parity":2)",
    R"("samplingIntervalMs":0)", R"("samplingIntervalMs":4294967296)",
    R"("registerMap":[])", R"("registerMap":[null])",
    R"("registerMap":[{"key":"x"}])",
    R"("registerMap":[{"key":"x","address":65536}])",
    R"("registerMap":[{"key":"x","address":0,"functionCode":6}])",
    R"("registerMap":[{"key":"x","address":0,"dataType":"FLOAT32"}])",
    R"("registerMap":[{"key":"x","address":0,"scale":"bad"}])",
    R"("registerMap":[{"key":"x","address":0},{"key":"x","address":1}])",
  };
  for (const char *field : invalid_fields) {
    DynamicJsonDocument doc(8192), patch(8192);
    assert(!deserializeJson(doc, valid));
    assert(!deserializeJson(patch, std::string("{") + field + "}"));
    for (JsonPair pair : patch.as<JsonObject>()) doc[pair.key()] = pair.value();
    std::string json;
    serializeJson(doc, json);
    rejected(json);
  }

  for (const char *key : {"temp-value", "0temp", "_temp", "constructor", "prototype", "__proto__", "temp value"}) {
    rejected(std::string(R"({"deviceId":"CNC-02","registerMap":[{"key":")") + key + R"(","address":0}]})");
  }

  // A full supported map fits and applies; an extra register must not be truncated.
  DynamicJsonDocument doc(16384);
  doc["deviceId"] = "CNC-02";
  doc["slaveId"] = 247;
  doc["stopBits"] = 2;
  doc["parity"] = "EVEN";
  JsonArray registers = doc.createNestedArray("registerMap");
  for (int i = 0; i < MAX_REGISTERS; ++i) {
    JsonObject reg = registers.createNestedObject();
    reg["key"] = std::string("metric") + std::to_string(i);
    reg["address"] = i;
    reg["dataType"] = "UINT16";
  }
  std::string json;
  serializeJson(doc, json);
  assert(apply_new_configuration(json.c_str()));
  assert(global_device_config.register_count == MAX_REGISTERS);
  assert(global_device_config.slave_id == 247);
  registers.createNestedObject()["key"] = "extra";
  json.clear(); serializeJson(doc, json); rejected(json);
  // The same raw register must respect the configured signedness.
  assert(apply_new_configuration(valid));
  modbus_result_t result = {};
  assert(modbus_poll_and_collect(&global_device_config, &result, 1) == 1);
  assert(result.success && result.scaled_value == -1.0f);
  strcpy(global_device_config.registers[0].data_type, "UINT16");
  assert(modbus_poll_and_collect(&global_device_config, &result, 1) == 1);
  assert(result.success && result.scaled_value == 65535.0f);
  std::cout << "Configuration tests passed (invalid updates preserve config and UART).\n";
}

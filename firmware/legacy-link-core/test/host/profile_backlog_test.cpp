#include "../../src/main.cpp"
#include <ModbusMaster.h>
#include <cassert>
#include <iostream>
TestSerial Serial, Serial2;
TestEsp ESP;
unsigned long test_millis = 0;
int main() {
  setup();
  const char *a = R"({"deviceId":"BENCH-01","requestId":"profile-a","registerMap":[{"key":"temperature","address":0,"scale":0.1,"alarm":{"threshold":90,"code":"OVERHEAT","severity":"high"}}]})";
  const char *b = R"({"deviceId":"BENCH-01","requestId":"profile-b","registerMap":[{"key":"current","address":49,"scale":0.01}]})";
  assert(apply_runtime_config(a));
  modbus_response()[0] = 950;
  mqttClient.disconnect();
  poll_modbus_step();
  assert(telemetry_queue.size() == 1 && alarm_queue.size() == 1);
  const std::string oldId = telemetry_queue.front()->id;
  const std::string oldPayload = telemetry_queue.front()->payload;
  const std::string alarmPayload = alarm_queue.front()->payload;
  // Applying B is immediate while A's telemetry and alarm remain unacknowledged.
  assert(apply_runtime_config(b));
  assert(!strcmp(active_request_id, "profile-b"));
  assert(global_device_config.registers[0].address == 49);
  assert(!reading_seen[0]);
  modbus_response()[0] = 123;
  poll_modbus_step();
  assert(telemetry_queue.size() == 2 && alarm_queue.size() == 1);
  assert(oldPayload == telemetry_queue.front()->payload && oldId == telemetry_queue.front()->id);
  assert(alarmPayload == alarm_queue.front()->payload);
  DynamicJsonDocument doc(2048);
  assert(!deserializeJson(doc, telemetry_queue.at(1)->payload));
  assert(doc["metrics"].size() == 1 && doc["metrics"].containsKey("current"));
  assert(fabs(doc["metrics"]["current"].as<double>() - 1.23) < .0001);
  // Rejection retains A and leaves B's measurement/configuration working.
  std::string rejected = "{\"schemaVersion\":1,\"deviceId\":\"BENCH-01\",\"kind\":\"telemetry\",\"messageId\":\"" + oldId + "\",\"status\":\"rejected\",\"reason\":\"metric_retired\"}";
  mqttClient.receive("legacy-link/gateways/123456789ABC/ingestion/ack", rejected);
  assert(telemetry_queue.size() == 2 && !strcmp(active_request_id, "profile-b"));
  assert(telemetry_queue.acknowledge("BENCH-01", oldId.c_str()));
  reconnect_mqtt(); mqttClient.published.clear(); flush_telemetry();
  assert(mqttClient.published.size() == 1);
  assert(!deserializeJson(doc, mqttClient.published.back().payload));
  assert(doc["metrics"].containsKey("current"));
  assert(!apply_runtime_config("{\"registerMap\":[]}"));
  assert(!strcmp(active_request_id, "profile-b") && reading_seen[0]);
  std::cout << "Profile B applies immediately; old telemetry/alarm bytes survive backlog and rejection.\n";
}

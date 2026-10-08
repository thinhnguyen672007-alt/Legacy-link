#include "../../src/main.cpp"
#include <cassert>
#include <iostream>
TestSerial Serial, Serial2;
TestEsp ESP;
unsigned long test_millis=0;
int main() {
  setup();
  device_config_t cfg{}; strcpy(cfg.device_id,"BENCH-01");
  modbus_result_t reading{}; strcpy(reading.key,"temperature");
  reading.success=true; reading.scaled_value=-18;
  mqttClient.disconnect();
  publish_telemetry(&cfg,&reading,1);
  assert(telemetry_queue.size()==1);
  const std::string originalId=telemetry_queue.front()->id;
  reconnect_mqtt(); mqttClient.published.clear();
  flush_telemetry();
  assert(mqttClient.published.size()==1);
  const auto first=mqttClient.published.back().payload;
  test_millis+=1000; flush_telemetry();
  assert(mqttClient.published.back().payload==first);
  assert(telemetry_queue.size()==1); // MQTT publish alone never removes a sample.
  mqttClient.receive("legacy-link/gateways/123456789ABC/ingestion/ack", "{\"schemaVersion\":1,\"deviceId\":\"BENCH-01\",\"messageId\":\"wrong\",\"kind\":\"telemetry\",\"status\":\"committed\"}");
  assert(telemetry_queue.size()==1);
  std::string ack="{\"schemaVersion\":1,\"deviceId\":\"BENCH-01\",\"messageId\":\""+originalId+"\",\"kind\":\"telemetry\",\"status\":\"committed\"}";
  mqttClient.receive("legacy-link/gateways/OTHER/ingestion/ack",ack);
  assert(telemetry_queue.size()==1);
  mqttClient.receive("legacy-link/gateways/123456789ABC/ingestion/ack",ack);
  assert(telemetry_queue.size()==0);
  mqttClient.receive("legacy-link/gateways/123456789ABC/ingestion/ack",ack);
  assert(telemetry_queue.size()==0);
  std::cout << "Offline queue, retry and exact ACK tests passed.\n";
}

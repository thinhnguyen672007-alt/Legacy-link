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
  // Registration rejection retains the sample and applies a 30-second retry.
  publish_telemetry(&cfg,&reading,1);
  auto *head=telemetry_queue.front(); assert(head);
  std::string rejected="{\"schemaVersion\":1,\"deviceId\":\"BENCH-01\",\"kind\":\"telemetry\",\"messageId\":\""+std::string(head->id)+"\",\"status\":\"rejected\",\"reason\":\"unknown_device\"}";
  mqttClient.receive("legacy-link/gateways/123456789ABC/ingestion/ack",rejected);
  assert(telemetry_queue.size()==1 && !strcmp(head->rejection,"unknown_device"));
  const size_t sent=mqttClient.published.size();
  test_millis+=29999; flush_telemetry(); assert(mqttClient.published.size()==sent);
  test_millis+=1; flush_telemetry(); assert(mqttClient.published.size()==sent+1);
  // An alarm ACK with the telemetry ID cannot remove that telemetry sample.
  std::string wrongKind="{\"schemaVersion\":1,\"deviceId\":\"BENCH-01\",\"kind\":\"alarm\",\"messageId\":\""+std::string(head->id)+"\",\"status\":\"committed\"}";
  mqttClient.receive("legacy-link/gateways/123456789ABC/ingestion/ack",wrongKind);
  assert(telemetry_queue.size()==1);
  // Offline alarms have their own capacity and retain their original identity.
  cfg.register_count=1;
  strcpy(cfg.registers[0].key,"temperature");
  auto &alarm=cfg.registers[0].alarm;
  strcpy(alarm.code,"OVERHEAT"); strcpy(alarm.severity,"critical");
  mqttClient.disconnect();
  assert(publish_alarm(&cfg,&alarm,105,current_epoch_ms()));
  assert(alarm_queue.size()==1);
  const std::string event=alarm_queue.front()->id;
  assert(event!=telemetry_queue.front()->id);
  strcpy(cfg.device_id,"NEW-MACHINE");
  reconnect_mqtt(); flush_queue(alarm_queue,"alarm");
  const auto &alarmMessage=mqttClient.published.back();
  assert(alarmMessage.topic=="legacy-link/devices/BENCH-01/alarm");
  StaticJsonDocument<1024> parsed;
  assert(!deserializeJson(parsed,alarmMessage.payload));
  assert(parsed["metricKey"]=="temperature" && parsed["gatewayId"]==gateway_id);
  assert(parsed["eventId"]==event);
  std::string alarmAck="{\"schemaVersion\":1,\"deviceId\":\"BENCH-01\",\"kind\":\"alarm\",\"messageId\":\""+event+"\",\"status\":\"committed\"}";
  mqttClient.receive("legacy-link/gateways/123456789ABC/ingestion/ack",alarmAck);
  assert(alarm_queue.size()==0 && telemetry_queue.size()==1);
  // Retry clock survives uint32 millis wrap.
  head=telemetry_queue.front(); head->rejection[0]=0; head->attempts=1;
  head->lastAttempt=0xffffff00UL;
  const size_t beforeWrap=mqttClient.published.size();
  test_millis=743; flush_telemetry(); assert(mqttClient.published.size()==beforeWrap);
  test_millis=744; flush_telemetry(); assert(mqttClient.published.size()==beforeWrap+1);
  std::cout << "Offline queue, retry and exact ACK tests passed.\n";
}

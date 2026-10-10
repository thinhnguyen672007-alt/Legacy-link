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
  // Missing ACK: retain exact bytes throughout exponential backoff and its cap.
  head->attempts=0; head->lastAttempt=0;
  test_millis=10000;
  const std::string retryPayload=head->payload;
  flush_telemetry();
  const unsigned delays[]={1000,2000,4000,8000,16000,32000,32000};
  for (const unsigned delay : delays) {
    const size_t sentBefore=mqttClient.published.size();
    test_millis+=delay-1; flush_telemetry();
    assert(mqttClient.published.size()==sentBefore);
    test_millis+=1; flush_telemetry();
    assert(mqttClient.published.size()==sentBefore+1);
    assert(mqttClient.published.back().payload==retryPayload);
    assert(telemetry_queue.size()==1);
  }
  // Invalid ACK schemas/statuses and wrong devices cannot unblock the queue.
  const std::string id=head->id;
  for (const std::string &invalid : std::vector<std::string>{
    "{",
    "{\"schemaVersion\":2,\"deviceId\":\"BENCH-01\",\"kind\":\"telemetry\",\"messageId\":\""+id+"\",\"status\":\"committed\"}",
    "{\"schemaVersion\":1,\"deviceId\":\"OTHER\",\"kind\":\"telemetry\",\"messageId\":\""+id+"\",\"status\":\"committed\"}",
    "{\"schemaVersion\":1,\"deviceId\":\"BENCH-01\",\"kind\":\"telemetry\",\"messageId\":\""+id+"\",\"status\":\"received\"}"}) {
    mqttClient.receive("legacy-link/gateways/123456789ABC/ingestion/ack",invalid);
    assert(telemetry_queue.size()==1);
  }
  // Escaped NULs must not turn a different JSON identity/status into a match.
  DynamicJsonDocument malformed(1024);
  const std::string good = "{\"schemaVersion\":1,\"deviceId\":\"BENCH-01\",\"kind\":\"telemetry\",\"messageId\":\""+id+"\",\"status\":\"committed\"}";
  for (const char *field : {"deviceId", "messageId", "kind", "status"}) {
    assert(!deserializeJson(malformed, good));
    const std::string value = malformed[field].as<std::string>();
    std::string invalid = good;
    const std::string token = std::string("\"") + field + "\":\"" + value + "\"";
    invalid.replace(invalid.find(token), token.size(), std::string("\"") + field + "\":\"" + value + "\\u0000suffix\"");
    mqttClient.receive("legacy-link/gateways/123456789ABC/ingestion/ack", invalid);
    assert(telemetry_queue.size() == 1);
  }
  assert(!deserializeJson(malformed, good));
  malformed["status"] = "rejected"; malformed["reason"] = "";
  std::string emptyReason; serializeJson(malformed, emptyReason);
  mqttClient.receive("legacy-link/gateways/123456789ABC/ingestion/ack", emptyReason);
  assert(!strcmp(head->rejection, "rejected"));
  std::cout << "Offline queue, retry and exact ACK tests passed.\n";
}

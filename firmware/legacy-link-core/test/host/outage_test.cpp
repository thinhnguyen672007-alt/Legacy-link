#include "../../src/main.cpp"
#include <cassert>
#include <iostream>
#include <vector>
TestSerial Serial, Serial2;
TestEsp ESP;
unsigned long test_millis = 0;

static void ack(const std::string &id, const char *status = "committed") {
  mqttClient.receive("legacy-link/gateways/123456789ABC/ingestion/ack",
    "{\"schemaVersion\":1,\"deviceId\":\"BENCH-01\",\"kind\":\"telemetry\","
    "\"messageId\":\"" + id + "\",\"status\":\"" + status +
    "\",\"reason\":\"unknown_device\"}");
}

int main() {
  setup();
  mqttClient.disconnect();
  device_config_t cfg{}; strcpy(cfg.device_id, "BENCH-01");
  modbus_result_t reading{}; strcpy(reading.key, "temperature");
  reading.success = true;
  std::vector<std::string> ids, payloads;
  // Fill the real serializer/outbox path while the broker is disconnected.
  for (size_t i = 0; i < TelemetryQueue::capacity; ++i) {
    reading.scaled_value = double(i) - 18;
    publish_telemetry(&cfg, &reading, 1);
    test_millis += 2000;
  }
  assert(telemetry_queue.size() == 32 && telemetry_queue.highWater() == 32);
  const std::string firstId = telemetry_queue.front()->id;
  const std::string firstPayload = telemetry_queue.front()->payload;
  publish_telemetry(&cfg, &reading, 1);
  assert(telemetry_queue.size() == 32 && telemetry_queue.dropped() == 1);
  assert(firstId == telemetry_queue.front()->id);
  reconnect_mqtt(); mqttClient.published.clear();
  mqttClient.publish_ok = false;
  flush_telemetry();
  assert(mqttClient.published.empty() && telemetry_queue.size() == 32);
  mqttClient.publish_ok = true;
  test_millis += 1000; flush_telemetry();
  assert(mqttClient.published.back().payload == firstPayload);
  // An explicit rejection must not evict the head, even when the queue is full.
  ack(firstId, "rejected");
  assert(telemetry_queue.size() == 32);
  const size_t before = mqttClient.published.size();
  test_millis += 29999; flush_telemetry();
  assert(mqttClient.published.size() == before);
  test_millis += 1; flush_telemetry();
  assert(mqttClient.published.back().payload == firstPayload);
  // Registry recovery: exact committed ACK allows every accepted sample to drain.
  // Duplicate old ACKs must never delete the next head.
  while (telemetry_queue.front()) {
    const auto *head = telemetry_queue.front();
    ids.emplace_back(head->id); payloads.emplace_back(head->payload);
    test_millis += 32000; flush_telemetry();
    assert(mqttClient.published.back().payload == payloads.back());
    const size_t pending = telemetry_queue.size();
    ack(ids.back()); ack(ids.back());
    assert(telemetry_queue.size() == pending - 1);
  }
  assert(ids.size() == 32 && telemetry_queue.committed() == 32);
  for (size_t i = 0; i < payloads.size(); ++i) {
    StaticJsonDocument<1024> doc;
    assert(!deserializeJson(doc, payloads[i]));
    assert(doc["metrics"]["temperature"].as<double>() == double(i) - 18);
    if (i) assert(ids[i] != ids[i-1]);
  }
  // Reuse ring slots after recovery; old ACKs cannot acknowledge new samples.
  publish_telemetry(&cfg, &reading, 1);
  ack(firstId);
  assert(telemetry_queue.size() == 1 && telemetry_queue.dropped() == 1);
  std::cout << "Full outbox, failed publish, rejection and recovery tests passed.\n";
}

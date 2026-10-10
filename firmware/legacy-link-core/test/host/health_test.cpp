#include "../../src/main.cpp"
#include <cassert>
#include <iostream>
TestSerial Serial, Serial2;
TestEsp ESP;
unsigned long test_millis = 0;
int main() {
  setup();
  assert(telemetry_queue.push("BENCH-01", "boot-1", "{}"));
  auto *head = telemetry_queue.front();
  strcpy(head->rejection,"unknown_device"); head->attempts=2;
  char output[2048];
  assert(delivery_health_json(output,sizeof(output)));
  StaticJsonDocument<2048> doc;
  assert(!deserializeJson(doc,output));
  assert(doc["mqttTransport"]=="plaintext");
  assert(doc["telemetry"]["pending"]==1);
  assert(doc["telemetry"]["headId"]=="boot-1");
  assert(doc["telemetry"]["rejection"]=="unknown_device");
  assert(doc["telemetry"]["highWater"]==1);
  assert(doc["alarm"]["capacity"]==8);
  assert(!delivery_health_json(output,4));
  assert(outbox_entry_json(telemetry_queue, "telemetry", 0, output, sizeof(output)));
  assert(!deserializeJson(doc, output));
  assert(doc["messageId"] == "boot-1" && doc["attempts"] == 2);
  assert(doc["payloadBytes"] == 2 && !doc.containsKey("payload"));
  assert(!outbox_entry_json(telemetry_queue, "telemetry", 1, output, sizeof(output)));
  assert(!outbox_entry_json(telemetry_queue, "telemetry", 0, output, 4));
  assert(handle_serial_diagnostic(":outbox"));
  StaticJsonDocument<2048> delivery;
  describe_delivery(delivery.to<JsonObject>());
  assert(delivery["storage"]=="RAM");
  assert(delivery["telemetry"]["pending"]==1);
  assert(delivery["telemetry"]["rejection"]=="unknown_device");
  assert(delivery["alarm"]["capacity"]==8);
  const auto before=global_device_config;
  assert(handle_serial_diagnostic(":health"));
  assert(handle_serial_diagnostic(":help"));
  assert(!handle_serial_diagnostic("{}"));
  Serial.feed(":health\n:help\n"); loop();
  assert(!memcmp(&before,&global_device_config,sizeof(before)));
  assert(telemetry_queue.size()==1);
  assert(telemetry_queue.acknowledge("BENCH-01","boot-1"));
  assert(telemetry_queue.committed()==1 && telemetry_queue.highWater()==1);
  assert(apply_runtime_config(R"({"deviceId":"BENCH-01","registerMap":[{"key":"temperature","address":1}]})"));
  poll_modbus_step();
  assert(have_complete_scan && !poll_active && telemetry_queue.size() == 1);
  const std::string id = telemetry_queue.front()->id;
  mqttClient.receive("legacy-link/gateways/123456789ABC/ingestion/ack",
    "{\"schemaVersion\":1,\"deviceId\":\"BENCH-01\",\"kind\":\"telemetry\",\"messageId\":\"" + id + "\",\"status\":\"committed\"}");
  assert(delivery_report_dirty && telemetry_queue.size() == 0);
  test_millis += 1000;
  mqttClient.published.clear(); flush_delivery_report();
  assert(!delivery_report_dirty && mqttClient.published.size() == 1);
  DynamicJsonDocument report(8192); assert(!deserializeJson(report, mqttClient.published.back().payload));
  assert(report["delivery"]["telemetry"]["pending"] == 0);
  delivery_report_dirty = true; poll_active = true; test_millis += 1000;
  flush_delivery_report(); assert(mqttClient.published.size() == 1);
  poll_active = false; invalidate_readings();
  flush_delivery_report(); assert(mqttClient.published.size() == 1);
  std::cout << "Read-only USB delivery health tests passed.\n";
}

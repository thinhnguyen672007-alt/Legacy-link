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
  const auto before=global_device_config;
  assert(handle_serial_diagnostic(":health"));
  assert(handle_serial_diagnostic(":help"));
  assert(!handle_serial_diagnostic("{}"));
  Serial.feed(":health\n:help\n"); loop();
  assert(!memcmp(&before,&global_device_config,sizeof(before)));
  assert(telemetry_queue.size()==1);
  assert(telemetry_queue.acknowledge("BENCH-01","boot-1"));
  assert(telemetry_queue.committed()==1 && telemetry_queue.highWater()==1);
  std::cout << "Read-only USB delivery health tests passed.\n";
}

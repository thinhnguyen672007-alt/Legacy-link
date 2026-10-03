#include "../../src/main.cpp"
#include <ModbusMaster.h>
#include <cassert>
#include <iostream>

TestSerial Serial, Serial2;
TestEsp ESP;
unsigned long test_millis = 0;

int main() {
  WiFi.connection_status = WL_DISCONNECTED;
  setup();
  assert(test_millis == 1000); // only the existing Serial startup delay
  assert(WiFi.selected_mode == WIFI_STA && WiFi.begins == 1);
  assert(WiFi.reconnects == 0 && time_sync_calls() == 0);
  Serial.feed(R"({"deviceId":"CNC-01","registerMap":[{"key":"temperature","address":0}]})" "\n");
  loop();
  assert(is_config_valid && Serial2.begin_count == 1);
  assert(!mqttClient.connected() && mqttClient.subscriptions == 0);
  const unsigned initial_reads = modbus_read_calls();
  assert(initial_reads > 0);

  test_millis = 10999; loop(); assert(WiFi.reconnects == 0);
  test_millis = 11000; loop(); assert(WiFi.reconnects == 1);
  loop(); assert(WiFi.reconnects == 1); // no tight reconnect loop
  test_millis = 21000; loop(); assert(WiFi.reconnects == 2);
  assert(modbus_read_calls() > initial_reads); // offline polling stays active

  // Access point appears after boot: time sync must now start.
  WiFi.connection_status = WL_CONNECTED;
  test_millis = 26000; loop();
  assert(time_sync_calls() == 1);
  assert(mqttClient.connected() && mqttClient.subscriptions == 1);
  test_millis = 27000; loop();
  assert(time_sync_calls() == 1 && WiFi.reconnects == 2);

  const device_config_t before = global_device_config;
  const unsigned reads_before_disconnect = modbus_read_calls();
  const size_t sent_before_disconnect = mqttClient.published.size();
  WiFi.connection_status = WL_DISCONNECTED;
  test_millis = 28000; loop();
  assert(!mqttClient.connected() && espClient.stops == 1);
  assert(memcmp(&before, &global_device_config, sizeof(before)) == 0);
  assert(Serial2.begin_count == 1);
  assert(modbus_read_calls() > reads_before_disconnect);
  assert(mqttClient.published.size() == sent_before_disconnect);
  test_millis = 37999; loop(); assert(WiFi.reconnects == 2);
  test_millis = 38000; loop(); assert(WiFi.reconnects == 3);
  WiFi.connection_status = WL_CONNECTED;
  test_millis = 43000; loop();
  assert(time_sync_calls() == 2);
  assert(mqttClient.connected() && mqttClient.subscriptions == 2);
  assert(mqttClient.subscribed_topic == config_topic);

  // Retry timing stays correct when ESP32 millis() wraps after ~49 days.
  WiFi.connection_status = WL_DISCONNECTED;
  test_millis = 0xFFFFFF00UL; maintain_wifi();
  assert(espClient.stops == 2);
  test_millis = 9743; maintain_wifi(); assert(WiFi.reconnects == 3);
  test_millis = 9744; maintain_wifi(); assert(WiFi.reconnects == 4);
  std::cout << "Late Wi-Fi, reconnect, time synchronization and timer wrap tests passed.\n";
}

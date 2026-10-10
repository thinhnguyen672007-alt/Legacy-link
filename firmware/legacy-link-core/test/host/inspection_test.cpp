#include "../../src/main.cpp"
#include <cassert>
#include <ModbusMaster.h>
#include <iostream>
TestSerial Serial, Serial2;
TestEsp ESP;
unsigned long test_millis = 0;
int main() {
  setup();
  char output[1024];
  DynamicJsonDocument doc(2048);
  assert(!inspection_json(0, output, sizeof(output)));
  assert(handle_serial_diagnostic(":inspect"));
  const char *a = R"({"deviceId":"A","requestId":"profile-a","registerMap":[{"key":"temperature","address":0,"scale":0.1}]})";
  const char *b = R"({"deviceId":"A","requestId":"profile-b","registerMap":[{"key":"temperature","address":49,"scale":1}]})";
  assert(apply_runtime_config(a));
  auto inspect = [&]() {
    assert(inspection_json(0, output, sizeof(output)));
    assert(!deserializeJson(doc, output));
  };
  inspect(); assert(doc["state"] == "unknown" && !doc.containsKey("value"));
  modbus_response()[0] = static_cast<uint16_t>(-180);
  poll_modbus_step(); inspect();
  assert(doc["state"] == "ok" && !doc["stale"].as<bool>());
  assert(fabs(doc["value"].as<double>() + 18) < .0001);
  assert(doc["rawWords"][0] == 65356 && successful_reads == 1);
  test_millis += 5001; inspect(); assert(doc["stale"] == true);
  assert(apply_runtime_config(b)); inspect();
  assert(doc["state"] == "unknown" && doc["configRequestId"] == "profile-b");
  assert(doc["address"] == 49 && !doc.containsKey("rawValue") && !doc.containsKey("value"));
  modbus_error() = 0xE2;
  poll_modbus_step(); inspect();
  assert(doc["state"] == "error" && doc["errorCode"] == 0xE2 && failed_reads == 1);
  assert(!doc.containsKey("value"));
  // A failed apply must preserve the active diagnostics.
  assert(!apply_runtime_config("{}")); inspect(); assert(doc["state"] == "error");
  const auto calls = modbus_read_calls();
  assert(handle_serial_diagnostic(":inspect") && modbus_read_calls() == calls);
  assert(!inspection_json(0, output, 4) && !inspection_json(1, output, sizeof(output)));
  // Age calculation remains correct across millis wrap.
  poll_results[0].completed_at_ms = 0xffffff00UL; test_millis = 744;
  inspect(); assert(doc["ageMs"] == 1000);
  std::cout << "Register inspection: unknown, signed values, stale, profile change and errors passed.\n";
}

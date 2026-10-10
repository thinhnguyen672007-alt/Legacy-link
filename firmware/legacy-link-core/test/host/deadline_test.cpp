#include "../../src/main.cpp"
#include <Preferences.h>
#include <cassert>
#include <iostream>
TestSerial Serial, Serial2;
TestEsp ESP;
unsigned long test_millis = 0;
int main() {
  StaticJsonDocument<256> doc;
  assert(command_deadline_valid(doc, 0));
  for (const char *invalid : {"null", "true", "-1", "1.5", "\"99999\""}) {
    assert(!deserializeJson(doc, std::string("{\"expiresAt\":") + invalid + "}"));
    assert(!command_deadline_valid(doc, 100));
  }
  doc.clear(); doc["expiresAt"] = uint64_t(1000);
  assert(command_deadline_valid(doc, 999));
  assert(!command_deadline_valid(doc, 1000));
  assert(!command_deadline_valid(doc, 1001));
  assert(!command_deadline_valid(doc, 0));
  setup();
  assert(apply_runtime_config(R"({"deviceId":"A","registerMap":[{"key":"temperature","address":1}]})"));
  const auto before = global_device_config;
  const auto writes = storage_writes();
  // Simulate a command admitted earlier that expires before loop execution.
  for (bool probe : {false, true}) {
    strcpy(pending_config, R"({"deviceId":"B","requestId":"late","expiresAt":1,"registerMap":[{"key":"temperature","address":49}]})");
    pending_probe = probe; config_pending = true;
    loop();
    assert(!config_pending);
    assert(!memcmp(&before, &global_device_config, sizeof(before)));
    assert(storage_writes() == writes);
  }
  std::cout << "Deadline types, boundary and deferred execution tests passed.\n";
}

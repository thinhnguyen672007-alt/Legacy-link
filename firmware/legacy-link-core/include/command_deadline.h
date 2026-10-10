#pragma once
#include <ArduinoJson.h>
#include <stdint.h>

// Legacy local commands may omit a deadline. Remote deadlines must be integer
// epoch milliseconds and remain strictly in the future at execution time.
inline bool command_deadline_valid(const JsonDocument &command, uint64_t now) {
  if (!command.containsKey("expiresAt")) return true;
  return command["expiresAt"].is<uint64_t>() && now != 0 &&
         command["expiresAt"].as<uint64_t>() > now;
}

#include "config_store.h"
#include "device_config.h"
#include <Preferences.h>
#include <string.h>

bool load_saved_config(char *payload, size_t capacity) {
  if (!payload || !capacity) return false;
  payload[0] = '\0';
  Preferences preferences;
  if (!preferences.begin("legacy-link", true)) return false;
  const size_t length = preferences.getBytesLength("config");
  bool valid = length > 1 && length <= MAX_CONFIG_PAYLOAD_BYTES + 1 && length <= capacity;
  if (valid) valid = preferences.getBytes("config", payload, length) == length;
  preferences.end();
  if (valid) valid = payload[length - 1] == '\0' && memchr(payload, '\0', length - 1) == nullptr;
  if (!valid) payload[0] = '\0';
  return valid;
}

bool save_config(const char *payload) {
  if (!payload) return false;
  const size_t length = strnlen(payload, MAX_CONFIG_PAYLOAD_BYTES + 1);
  if (!length || length > MAX_CONFIG_PAYLOAD_BYTES) return false;
  Preferences preferences;
  if (!preferences.begin("legacy-link", false)) return false;
  const bool saved = preferences.putBytes("config", payload, length + 1) == length + 1;
  preferences.end();
  return saved;
}

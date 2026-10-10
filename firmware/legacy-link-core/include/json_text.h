#pragma once
#include <ArduinoJson.h>
#include <string.h>

// Reject embedded NULs rather than comparing only a JSON string's prefix.
inline const char *json_text(JsonVariantConst value, size_t maximum, bool allow_empty = false) {
  if (!value.is<const char *>()) return nullptr;
  const JsonString text = value.as<JsonString>();
  const char *data = text.c_str();
  if (!data || text.size() > maximum || (!allow_empty && !text.size()) ||
      strlen(data) != text.size()) return nullptr;
  return data;
}

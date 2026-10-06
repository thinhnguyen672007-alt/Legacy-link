#pragma once
#include <cstddef>
#include <cstring>
#include <vector>

inline std::vector<unsigned char> &saved_config_blob() { static std::vector<unsigned char> data; return data; }
inline bool &storage_available() { static bool value = true; return value; }
inline bool &storage_write_ok() { static bool value = true; return value; }
inline unsigned &storage_writes() { static unsigned value = 0; return value; }
struct Preferences {
  bool begin(const char *, bool = false) { return storage_available(); }
  void end() {}
  size_t getBytesLength(const char *) { return saved_config_blob().size(); }
  size_t getBytes(const char *, void *out, size_t capacity) {
    if (capacity < saved_config_blob().size()) return 0;
    memcpy(out, saved_config_blob().data(), saved_config_blob().size());
    return saved_config_blob().size();
  }
  size_t putBytes(const char *, const void *data, size_t length) {
    ++storage_writes();
    if (!storage_write_ok()) return 0;
    const auto *bytes = static_cast<const unsigned char *>(data);
    saved_config_blob().assign(bytes, bytes + length);
    return length;
  }
};

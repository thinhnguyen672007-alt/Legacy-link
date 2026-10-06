#pragma once
#include <stddef.h>

// The stored blob is a NUL-terminated JSON document, never a raw C struct.
bool load_saved_config(char *payload, size_t capacity);
bool save_config(const char *payload);

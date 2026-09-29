#!/usr/bin/env bash
set -euo pipefail
project_dir="$(cd "$(dirname "$0")/../.." && pwd)"
json_include="$project_dir/.pio/libdeps/esp32dev/ArduinoJson/src"
if [[ ! -f "$json_include/ArduinoJson.h" ]]; then
  echo 'Run pio pkg install -d firmware/legacy-link-core first.' >&2
  exit 1
fi
binary="$(mktemp /tmp/legacy-link-config-test.XXXXXX)"
trap 'rm -f "$binary"' EXIT
for test_source in config_parser_test gateway_test; do
"${CXX:-c++}" -std=c++11 -Wall -Wextra -Werror \
  -fsanitize=address,undefined -fno-omit-frame-pointer \
  -I "$project_dir/test/host/stubs" -I "$project_dir/include" -I "$json_include" \
  "$project_dir/src/modbus_reader.cpp" \
  "$project_dir/src/config_parser.cpp" "$project_dir/test/host/$test_source.cpp" \
  -o "$binary"
"$binary"
done

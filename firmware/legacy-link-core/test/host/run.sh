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
for test_source in config_parser_test gateway_test alarm_test network_test endpoint_test config_size_test polling_test recovery_test rs485_test probe_test telemetry_queue_test delivery_test outage_test health_test; do
extra_flags=(-DLEGACYLINK_HOST_BUILD)
if [[ "$test_source" == rs485_test ]]; then
  extra_flags+=(-DLEGACYLINK_RS485_DE_RE_PIN=23)
fi
"${CXX:-c++}" -std=c++11 -Wall -Wextra -Werror \
  "${extra_flags[@]}" \
  -fsanitize=address,undefined -fno-omit-frame-pointer \
  -I "$project_dir/test/host/stubs" -I "$project_dir/include" -I "$json_include" \
  "$project_dir/src/modbus_reader.cpp" \
  "$project_dir/src/alarm_monitor.cpp" \
  "$project_dir/src/config_parser.cpp" "$project_dir/test/host/$test_source.cpp" \
  "$project_dir/src/config_store.cpp" \
  -o "$binary"
"$binary"
done

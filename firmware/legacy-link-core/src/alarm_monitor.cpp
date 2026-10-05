#include "alarm_monitor.h"
#include <math.h>
#include <string.h>

void AlarmMonitor::reset() {
  memset(notified, 0, sizeof(notified));
  memset(critical_notified, 0, sizeof(critical_notified));
  memset(low_notified, 0, sizeof(low_notified));
}

void AlarmMonitor::evaluate(const device_config_t *cfg, const modbus_result_t *readings,
                            uint8_t count, uint64_t timestamp, alarm_publisher_t publish) {
  for (uint8_t i = 0; i < cfg->register_count && i < MAX_REGISTERS; ++i) {
    const auto &reg = cfg->registers[i];
    if (!reg.alarm.enabled && !reg.low_alarm.enabled) continue;
    for (uint8_t j = 0; j < count; ++j) {
      if (strcmp(reg.key, readings[j].key) != 0) continue;
      if (!readings[j].success || !isfinite(readings[j].scaled_value)) break;
      const double value = readings[j].scaled_value;
      const auto &low = reg.low_alarm;
      if (low.enabled) {
        if (value >= low.threshold + low.hysteresis) low_notified[i] = false;
        if (!low_notified[i] && value < low.threshold && timestamp != 0)
          low_notified[i] = publish(cfg, &low, value, timestamp);
      }
      if (!reg.alarm.enabled) break;
      const auto &critical = reg.critical_alarm;
      if (critical.enabled) {
        if (value <= critical.threshold - critical.hysteresis) critical_notified[i] = false;
        if (value > critical.threshold) {
          if (!critical_notified[i] && timestamp != 0 && publish(cfg, &critical, value, timestamp)) {
            critical_notified[i] = true;
            notified[i] = true; // A direct jump emits only the highest severity.
          }
          break;
        }
      }
      // Rearm only after a valid reading returns below the reset boundary.
      if (value <= reg.alarm.threshold - reg.alarm.hysteresis) notified[i] = false;
      if (!notified[i] && value > reg.alarm.threshold && timestamp != 0) {
        // Failed sends remain eligible on the next valid, above-threshold poll.
        notified[i] = publish(cfg, &reg.alarm, value, timestamp);
      }
      break;
    }
  }
}

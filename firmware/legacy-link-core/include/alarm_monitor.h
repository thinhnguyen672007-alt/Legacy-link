#pragma once
#include "device_config.h"
#include "modbus_reader.h"

using alarm_publisher_t = bool (*)(const device_config_t *, const alarm_config_t *,
                                  double, uint64_t);

class AlarmMonitor {
 public:
  void reset();
  void evaluate(const device_config_t *cfg, const modbus_result_t *readings,
                uint8_t count, uint64_t timestamp, alarm_publisher_t publish);
 private:
  bool notified[MAX_REGISTERS] = {};
  bool critical_notified[MAX_REGISTERS] = {};
  bool low_notified[MAX_REGISTERS] = {};
};

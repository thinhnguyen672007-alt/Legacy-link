/**
 * @file config_parser.cpp
 * @brief BỘ PHIÊN DỊCH & CẤU HÌNH TỰ ĐỘNG (Config-driven Core)
 *
 * Vai trò:
 * 1. Nhận JSON từ Backend (qua MQTT/Serial) và bóc tách thành C Struct an toàn
 * (không rò rỉ RAM).
 * 2. Tự động ra lệnh cho phần cứng ESP32 (UART2) thay đổi tốc độ (Baud,
 * Parity...) để tương thích ngay lập tức với máy CNC mới mà KHÔNG cần nạp lại
 * code.
 */
#include "config_parser.h"
#include "device_config.h"
#include "driver/uart.h"
#include <Arduino.h>
#include <ArduinoJson.h>
#include <math.h>
#include <memory>
#include <new>

device_config_t global_device_config = {};
bool is_config_valid = false;

#define UART_CNC_PORT UART_NUM_2
#define UART_CNC_TX_PIN 17
#define UART_CNC_RX_PIN 16
#define UART_CNC_BUF_SIZE 1024

static uint8_t parse_parity(const char *parity_str) {
  if (strcmp(parity_str, "EVEN") == 0) {
    return UART_PARITY_EVEN;
  }
  if (strcmp(parity_str, "ODD") == 0) {
    return UART_PARITY_ODD;
  }
  return UART_PARITY_DISABLE;
}

static uint32_t get_serial_config(uint8_t parity, uint8_t stop_bits) {
  if (parity == UART_PARITY_EVEN) {
    if (stop_bits == 2) {
      return SERIAL_8E2;
    }
    return SERIAL_8E1;
  }
  if (parity == UART_PARITY_ODD) {
    if (stop_bits == 2) {
      return SERIAL_8O2;
    }
    return SERIAL_8O1;
  }
  if (stop_bits == 2) {
    return SERIAL_8N2;
  }
  return SERIAL_8N1;
}

// Reject invalid input before narrowing integers or copying into fixed buffers.
static bool read_string(JsonVariantConst value, char *out, size_t capacity,
                        const char *fallback, bool required = false) {
  const char *text = value.isNull() ? fallback : value.as<const char *>();
  if (!value.isNull() && value.as<JsonString>().size() != (text ? strlen(text) : 0)) return false;
  if (!text || strlen(text) >= capacity || (required && !text[0])) return false;
  strlcpy(out, text, capacity);
  return true;
}

static bool read_uint(JsonVariantConst value, uint32_t fallback,
                      uint32_t minimum, uint32_t maximum, uint32_t &out) {
  if (!value.isNull() && !value.is<uint32_t>()) return false;
  out = value.isNull() ? fallback : value.as<uint32_t>();
  return out >= minimum && out <= maximum;
}

static bool valid_alarm_code(const char *code) {
  return !strcmp(code, "OVERHEAT") || !strcmp(code, "OVERCURRENT") ||
         !strcmp(code, "OVERSPEED") || !strcmp(code, "VIBRATION");
}

static bool valid_severity(const char *severity) {
  return !strcmp(severity, "low") || !strcmp(severity, "medium") ||
         !strcmp(severity, "high") || !strcmp(severity, "critical");
}

static bool read_endpoint_alarm(JsonVariant entry, const char *threshold_field,
                                const char *code_field, const char *severity_field,
                                bool below, alarm_config_t &alarm) {
  if (entry[threshold_field].isNull()) return true;
  if (!entry[threshold_field].is<float>() ||
      !read_string(entry[code_field], alarm.code, sizeof(alarm.code), "", true) ||
      !valid_alarm_code(alarm.code) ||
      !read_string(entry[severity_field], alarm.severity, sizeof(alarm.severity), "high") ||
      !valid_severity(alarm.severity)) {
    Serial.println("[CONFIG] Alarm requires a numeric threshold and an explicit supported code");
    return false;
  }
  alarm.threshold = entry[threshold_field].as<float>();
  if (!entry["alarm_hysteresis"].isNull() && !entry["alarm_hysteresis"].is<float>()) return false;
  alarm.hysteresis = entry["alarm_hysteresis"] | 0.0f;
  alarm.below = below;
  alarm.enabled = true;
  return isfinite(alarm.threshold) && isfinite(alarm.hysteresis) && alarm.hysteresis >= 0 &&
      isfinite(below ? alarm.threshold + alarm.hysteresis : alarm.threshold - alarm.hysteresis);
}

bool parse_device_config(const char *json_payload, device_config_t *out) {
  if (!json_payload || !out) return false;
  // Keep JSON storage off the ESP32 loop stack as register configs grow.
  DynamicJsonDocument doc(8192);
  DeserializationError err = deserializeJson(doc, json_payload);
  if (err || !doc.is<JsonObject>()) {
    Serial.println("[CONFIG] Invalid JSON object");
    return false;
  }

  // Multiple alarm levels enlarge this struct; keep nested parsing off the
  // ESP32 loop task's limited stack while retaining all-or-nothing updates.
  std::unique_ptr<device_config_t> storage(new (std::nothrow) device_config_t{});
  if (!storage) return false;
  device_config_t &candidate = *storage;
  if (!read_string(doc["deviceId"], candidate.device_id, sizeof(candidate.device_id), "", true) ||
      !read_string(doc["deviceName"], candidate.device_name, sizeof(candidate.device_name), "") ||
      !read_string(doc["protocol"], candidate.protocol, sizeof(candidate.protocol), "MODBUS_RTU") ||
      strcmp(candidate.protocol, "MODBUS_RTU") != 0) return false;
  for (const char *c = candidate.device_id; *c; ++c) {
    if (static_cast<unsigned char>(*c) <= 32 || *c == 127 || *c == '/' || *c == '+' || *c == '#') return false;
  }

  if (!read_uint(doc["baudRate"], 9600, 300, 2000000, candidate.baud_rate) ||
      !read_uint(doc["samplingIntervalMs"], 1000, 100, 86400000, candidate.sampling_interval_ms)) return false;
  uint32_t number;
  if (!read_uint(doc["stopBits"], 1, 1, 2, number)) return false;
  candidate.stop_bits = number;
  if (!read_uint(doc["slaveId"], 1, 1, 247, number)) return false;
  candidate.slave_id = number;
  const char *parity = doc["parity"].isNull() ? "NONE" : doc["parity"].as<const char *>();
  if (!parity || (strcmp(parity, "NONE") && strcmp(parity, "EVEN") && strcmp(parity, "ODD"))) return false;
  candidate.parity = parse_parity(parity);

  // Endpoint rows use database column names. Keep the original serial/MQTT
  // format working, but never guess which map should win in a mixed payload.
  const bool endpoint_format = doc.containsKey("registers");
  if (endpoint_format && doc.containsKey("registerMap")) {
    Serial.println("[CONFIG] Use registers or registerMap, not both");
    return false;
  }
  JsonArray registers = doc[endpoint_format ? "registers" : "registerMap"].as<JsonArray>();
  if (registers.isNull() || registers.size() == 0 || registers.size() > MAX_REGISTERS) {
    Serial.println("[CONFIG] Expected a non-empty register array (maximum 16 entries)");
    return false;
  }
  for (JsonVariant entry : registers) {
    if (!entry.is<JsonObject>()) return false;
    const char *foreign_fields[] = {
      endpoint_format ? "key" : "metric_key",
      endpoint_format ? "address" : "protocol_address",
      endpoint_format ? "dataType" : "data_type",
      endpoint_format ? "functionCode" : "function_code",
      endpoint_format ? "wordOrder" : "word_order"
    };
    for (const char *field : foreign_fields) {
      if (entry.containsKey(field)) {
        Serial.println("[CONFIG] Mixed register field naming is not supported");
        return false;
      }
    }
    register_config_t &reg = candidate.registers[candidate.register_count];
    if (!read_string(entry[endpoint_format ? "metric_key" : "key"], reg.key, sizeof(reg.key), "", true) ||
        !read_string(entry[endpoint_format ? "data_type" : "dataType"], reg.data_type, sizeof(reg.data_type), endpoint_format ? "UINT16" : "INT16") ||
        !read_string(entry["unit"], reg.unit, sizeof(reg.unit), "")) return false;
    const bool wide = !strcmp(reg.data_type, "UINT32");
    if (strcmp(reg.data_type, "INT16") && strcmp(reg.data_type, "UINT16") && !wide) return false;
    const char *word_field = endpoint_format ? "word_order" : "wordOrder";
    char word_order[11];
    if (!read_string(entry[word_field], word_order, sizeof(word_order), "HIGH_FIRST")) return false;
    if (strcmp(word_order, "HIGH_FIRST") && strcmp(word_order, "LOW_FIRST")) return false;
    reg.low_word_first = !strcmp(word_order, "LOW_FIRST");
    for (uint8_t i = 0; i < candidate.register_count; ++i) {
      if (!strcmp(candidate.registers[i].key, reg.key)) return false;
    }
    JsonVariant address = entry[endpoint_format ? "protocol_address" : "address"];
    // protocol_address is already zero-based; modicon_address is display metadata.
    if (address.isNull() || !read_uint(address, 0, 0, 65535, number)) return false;
    reg.address = number;
    if (wide && reg.address == 65535) return false;
    if (!read_uint(entry[endpoint_format ? "function_code" : "functionCode"], 3, 3, 4, number)) return false;
    reg.function_code = number;
    if (!entry["scale"].isNull() && !entry["scale"].is<float>()) return false;
    reg.scale = entry["scale"].isNull() ? 1.0f : entry["scale"].as<float>();
    if (!isfinite(reg.scale)) return false;
    const bool flat_alarms = entry.containsKey("alarm_high") || entry.containsKey("alarm_low") || entry.containsKey("alarm_critical");
    if (flat_alarms) {
      if (entry.containsKey("alarm")) return false;
      if (!read_endpoint_alarm(entry, "alarm_high", "alarm_code", "alarm_severity", false, reg.alarm) ||
          !read_endpoint_alarm(entry, "alarm_low", "alarm_low_code", "alarm_low_severity", true, reg.low_alarm) ||
          !read_endpoint_alarm(entry, "alarm_critical", "alarm_code", "alarm_critical_severity", false, reg.critical_alarm)) return false;
      if (reg.critical_alarm.enabled) {
        if (!reg.alarm.enabled || strcmp(reg.alarm.severity, "high") || reg.critical_alarm.threshold <= reg.alarm.threshold) return false;
        strcpy(reg.critical_alarm.severity, "critical");
      }
      if (reg.low_alarm.enabled && reg.alarm.enabled && reg.low_alarm.threshold >= reg.alarm.threshold) return false;
    }
    if (entry.containsKey("alarm")) {
      JsonVariant alarm = entry["alarm"];
      if (!alarm.is<JsonObject>() || !alarm["threshold"].is<float>()) return false;
      reg.alarm.threshold = alarm["threshold"].as<float>();
      if (!isfinite(reg.alarm.threshold)) return false;
      if (alarm.containsKey("hysteresis") && !alarm["hysteresis"].is<float>()) return false;
      reg.alarm.hysteresis = alarm["hysteresis"] | 0.0f;
      if (!isfinite(reg.alarm.hysteresis) || reg.alarm.hysteresis < 0 ||
          !isfinite(reg.alarm.threshold - reg.alarm.hysteresis)) return false;
      if (!read_string(alarm["code"], reg.alarm.code, sizeof(reg.alarm.code), "", true) ||
          !read_string(alarm["severity"], reg.alarm.severity, sizeof(reg.alarm.severity), "", true)) return false;
      if (strcmp(reg.alarm.code, "OVERHEAT") && strcmp(reg.alarm.code, "OVERCURRENT") &&
          strcmp(reg.alarm.code, "OVERSPEED") && strcmp(reg.alarm.code, "VIBRATION")) return false;
      if (strcmp(reg.alarm.severity, "low") && strcmp(reg.alarm.severity, "medium") &&
          strcmp(reg.alarm.severity, "high") && strcmp(reg.alarm.severity, "critical")) return false;
      reg.alarm.enabled = true;
      if (alarm.containsKey("criticalThreshold")) {
        if (!alarm["criticalThreshold"].is<float>() || strcmp(reg.alarm.severity, "high")) return false;
        reg.critical_alarm = reg.alarm;
        reg.critical_alarm.threshold = alarm["criticalThreshold"].as<float>();
        strcpy(reg.critical_alarm.severity, "critical");
        if (!isfinite(reg.critical_alarm.threshold) || reg.critical_alarm.threshold <= reg.alarm.threshold) return false;
      }
    }
    ++candidate.register_count;
  }

  *out = candidate;
  return true;
}

bool apply_uart_config(const device_config_t *cfg) {
  uint32_t serial_config = get_serial_config(cfg->parity, cfg->stop_bits);
  Serial2.begin(cfg->baud_rate, serial_config, UART_CNC_RX_PIN,
                UART_CNC_TX_PIN);
  Serial.printf("[UART2] Reconfigured OK: baud=%lu, parity=%u, stop=%u\r\n",
                cfg->baud_rate, cfg->parity, cfg->stop_bits);
  return true;
}

void print_device_config(const device_config_t *cfg) {
  Serial.println("========================================");
  Serial.println("       DEVICE CONFIGURATION SUMMARY     ");
  Serial.println("========================================");

  char line[80];

  snprintf(line, sizeof(line), "  Device ID     : %s", cfg->device_id);
  Serial.println(line);
  snprintf(line, sizeof(line), "  Device Name   : %s", cfg->device_name);
  Serial.println(line);
  snprintf(line, sizeof(line), "  Protocol      : %s", cfg->protocol);
  Serial.println(line);
  snprintf(line, sizeof(line), "  Baud Rate     : %lu", static_cast<unsigned long>(cfg->baud_rate));
  Serial.println(line);

  const char *parity_name = "NONE";
  if (cfg->parity == UART_PARITY_EVEN)
    parity_name = "EVEN";
  if (cfg->parity == UART_PARITY_ODD)
    parity_name = "ODD";
  snprintf(line, sizeof(line), "  Parity        : %s", parity_name);
  Serial.println(line);

  snprintf(line, sizeof(line), "  Stop Bits     : %u", cfg->stop_bits);
  Serial.println(line);
  snprintf(line, sizeof(line), "  Slave ID      : %u", cfg->slave_id);
  Serial.println(line);
  snprintf(line, sizeof(line), "  Sampling (ms) : %lu",
           static_cast<unsigned long>(cfg->sampling_interval_ms));
  Serial.println(line);

  snprintf(line, sizeof(line), "  Registers     : %u", cfg->register_count);
  Serial.println(line);

  Serial.println("  --------------------------------------");
  for (uint8_t i = 0; i < cfg->register_count; i++) {
    Serial.printf(
             "  [%u] addr=%u  FC=%u  key=%-12s  type=%-7s  scale=%.2f  unit=%s\r\n",
             i, cfg->registers[i].address, cfg->registers[i].function_code,
             cfg->registers[i].key, cfg->registers[i].data_type,
             (double)cfg->registers[i].scale, cfg->registers[i].unit);
  }
  Serial.println("========================================");
}

bool apply_new_configuration(const char *json_payload) {
  device_config_t candidate = {};
  if (!parse_device_config(json_payload, &candidate)) {
    Serial.println("[CONFIG] Rejected: invalid configuration; keeping current config");
    return false;
  }
  if (!apply_uart_config(&candidate)) {
    Serial.println("[CONFIG] Aborted: UART2 reconfiguration failed");
    return false;
  }
  global_device_config = candidate;
  is_config_valid = true;
  print_device_config(&global_device_config);
  Serial.println("[CONFIG] Configuration applied successfully");
  return true;
}

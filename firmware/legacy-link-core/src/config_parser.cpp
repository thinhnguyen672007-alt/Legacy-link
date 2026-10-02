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

bool parse_device_config(const char *json_payload, device_config_t *out) {
  if (!json_payload || !out) return false;
  // Keep JSON storage off the ESP32 loop stack as register configs grow.
  DynamicJsonDocument doc(8192);
  DeserializationError err = deserializeJson(doc, json_payload);
  if (err || !doc.is<JsonObject>()) {
    Serial.println("[CONFIG] Invalid JSON object");
    return false;
  }

  device_config_t candidate = {};
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

  JsonArray registers = doc["registerMap"].as<JsonArray>();
  if (registers.isNull() || registers.size() == 0 || registers.size() > MAX_REGISTERS) return false;
  for (JsonVariant entry : registers) {
    if (!entry.is<JsonObject>()) return false;
    register_config_t &reg = candidate.registers[candidate.register_count];
    if (!read_string(entry["key"], reg.key, sizeof(reg.key), "", true) ||
        !read_string(entry["dataType"], reg.data_type, sizeof(reg.data_type), "INT16") ||
        !read_string(entry["unit"], reg.unit, sizeof(reg.unit), "")) return false;
    // The reader currently handles one 16-bit register per metric.
    if (strcmp(reg.data_type, "INT16") && strcmp(reg.data_type, "UINT16")) return false;
    for (uint8_t i = 0; i < candidate.register_count; ++i) {
      if (!strcmp(candidate.registers[i].key, reg.key)) return false;
    }
    if (entry["address"].isNull() || !read_uint(entry["address"], 0, 0, 65535, number)) return false;
    reg.address = number;
    if (!read_uint(entry["functionCode"], 3, 3, 4, number)) return false;
    reg.function_code = number;
    if (!entry["scale"].isNull() && !entry["scale"].is<float>()) return false;
    reg.scale = entry["scale"].isNull() ? 1.0f : entry["scale"].as<float>();
    if (!isfinite(reg.scale)) return false;
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

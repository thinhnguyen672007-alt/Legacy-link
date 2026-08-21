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

device_config_t global_device_config = {};
bool is_config_valid = false;

static bool uart2_driver_installed = false;

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

bool parse_device_config(const char *json_payload, device_config_t *out) {
  StaticJsonDocument<1024> doc;

  DeserializationError err = deserializeJson(doc, json_payload);
  if (err) {
    Serial.printf("[CONFIG] JSON parse FAILED: %s\r\n", err.c_str());
    return false;
  }

  strlcpy(out->device_id, doc["deviceId"] | "UNKNOWN", sizeof(out->device_id));
  strlcpy(out->device_name, doc["deviceName"] | "", sizeof(out->device_name));
  strlcpy(out->protocol, doc["protocol"] | "MODBUS_RTU", sizeof(out->protocol));
  out->baud_rate = doc["baudRate"] | (uint32_t)9600;
  out->parity = parse_parity(doc["parity"] | "NONE");
  out->stop_bits = doc["stopBits"] | (uint8_t)1;
  out->slave_id = doc["slaveId"] | (uint8_t)1;
  out->sampling_interval_ms = doc["samplingIntervalMs"] | (uint32_t)1000;

  JsonArray reg_array = doc["registerMap"];
  if (reg_array.isNull()) {
    out->register_count = 0;
    Serial.println("[CONFIG] No registerMap found in payload");
    return true;
  }

  uint8_t i = 0;
  for (JsonObject reg : reg_array) {
    if (i >= MAX_REGISTERS) {
      Serial.printf("[CONFIG] WARNING: Too many registers, max=%u\r\n",
                    MAX_REGISTERS);
      break;
    }
    strlcpy(out->registers[i].key, reg["key"] | "unnamed",
            sizeof(out->registers[i].key));
    out->registers[i].address = reg["address"] | (uint16_t)0;
    out->registers[i].function_code = reg["functionCode"] | (uint8_t)3;
    strlcpy(out->registers[i].data_type, reg["dataType"] | "INT16",
            sizeof(out->registers[i].data_type));
    out->registers[i].scale = reg["scale"] | 1.0f;
    strlcpy(out->registers[i].unit, reg["unit"] | "",
            sizeof(out->registers[i].unit));
    i++;
  }
  out->register_count = i;

  Serial.println("[CONFIG] JSON parsed OK");
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
  snprintf(line, sizeof(line), "  Baud Rate     : %lu", cfg->baud_rate);
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
           cfg->sampling_interval_ms);
  Serial.println(line);

  snprintf(line, sizeof(line), "  Registers     : %u", cfg->register_count);
  Serial.println(line);

  Serial.println("  --------------------------------------");
  for (uint8_t i = 0; i < cfg->register_count; i++) {
    snprintf(line, sizeof(line),
             "  [%u] addr=%u  FC=%u  key=%-12s  type=%-7s  scale=%.2f  unit=%s",
             i, cfg->registers[i].address, cfg->registers[i].function_code,
             cfg->registers[i].key, cfg->registers[i].data_type,
             (double)cfg->registers[i].scale, cfg->registers[i].unit);
    Serial.println(line);
  }
  Serial.println("========================================");
}

void apply_new_configuration(const char *json_payload) {
  is_config_valid = false;

  if (!parse_device_config(json_payload, &global_device_config)) {
    Serial.println("[CONFIG] Aborted: invalid JSON");
    return;
  }

  if (global_device_config.slave_id < 1 || global_device_config.slave_id > 247) {
    Serial.printf("[CONFIG] Aborted: slaveId=%u out of range (1-247)\r\n",
                  global_device_config.slave_id);
    return;
  }

  if (!apply_uart_config(&global_device_config)) {
    Serial.println("[CONFIG] Aborted: UART2 reconfiguration failed");
    return;
  }

  print_device_config(&global_device_config);

  char summary[80];
  snprintf(summary, sizeof(summary),
           "[CONFIG] SUCCESS in <1s | Device=%s | Baud=%lu | Regs=%u",
           global_device_config.device_id, global_device_config.baud_rate, global_device_config.register_count);
  Serial.println(summary);

  is_config_valid = true;
}

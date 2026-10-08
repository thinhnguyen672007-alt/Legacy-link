#include "modbus_reader.h"
#include "gateway_settings.h"
#include <ModbusMaster.h>

// Khởi tạo đối tượng Modbus
static ModbusMaster node;

#if LEGACYLINK_RS485_DE_RE_PIN >= 0
static void begin_transmission() { digitalWrite(LEGACYLINK_RS485_DE_RE_PIN, HIGH); }
static void end_transmission() { digitalWrite(LEGACYLINK_RS485_DE_RE_PIN, LOW); }
#endif

void modbus_set_idle_callback(void (*callback)()) { node.idle(callback); }

static uint8_t read_metric(const register_config_t &reg, double &value, modbus_result_t *out = nullptr) {
  const bool wide = strcmp(reg.data_type, "UINT32") == 0;
  const uint16_t words = wide ? 2 : 1;
  uint8_t result = reg.function_code == 3
      ? node.readHoldingRegisters(reg.address, words)
      : node.readInputRegisters(reg.address, words);
  if (result != node.ku8MBSuccess) return result;
  const uint16_t first = node.getResponseBuffer(0);
  if (out) { out->raw_words[0] = first; out->word_count = words; }
  if (wide) {
    const uint16_t second = node.getResponseBuffer(1);
    const uint32_t raw = reg.low_word_first
        ? (static_cast<uint32_t>(second) << 16) | first
        : (static_cast<uint32_t>(first) << 16) | second;
    if (out) { out->raw_words[1] = second; out->raw_value = raw; }
    value = static_cast<double>(raw) * reg.scale;
  } else {
    const double raw = strcmp(reg.data_type, "INT16") == 0
        ? static_cast<double>(static_cast<int16_t>(first)) : first;
    if (out) out->raw_value = raw;
    value = raw * reg.scale;
  }
  return result;
}

void modbus_init(uint8_t slave_id) {
#if LEGACYLINK_RS485_DE_RE_PIN >= 0
  pinMode(LEGACYLINK_RS485_DE_RE_PIN, OUTPUT);
  digitalWrite(LEGACYLINK_RS485_DE_RE_PIN, LOW);
  node.preTransmission(begin_transmission);
  node.postTransmission(end_transmission);
#endif
  node.begin(slave_id, Serial2);
  Serial.printf("[MODBUS] Initialized node for Slave ID: %u\r\n", slave_id);
}

bool modbus_read_one(const device_config_t *cfg, uint8_t index, modbus_result_t *out) {
  if (!cfg || !out || index >= cfg->register_count) return false;
  const auto &reg = cfg->registers[index];
  *out = {};
  strlcpy(out->key, reg.key, sizeof(out->key));
  if (reg.function_code != 3 && reg.function_code != 4) return false;
  node.begin(cfg->slave_id, Serial2);
  const uint8_t status = read_metric(reg, out->scaled_value, out);
  out->error_code = status;
  out->completed_at_ms = millis();
  out->success = status == node.ku8MBSuccess;
  if (!out->success) {
    out->scaled_value = 0;
    Serial.printf("[%s] Modbus Error: 0x%02X\r\n", reg.key, status);
  }
  return out->success;
}

void modbus_poll_data(const device_config_t *cfg) {
  // Nếu không có thanh ghi nào, thoát luôn
  if (cfg->register_count == 0)
    return;

  Serial.println("--- Polling Modbus ---");
  node.begin(cfg->slave_id, Serial2); // Cập nhật lại Slave ID theo JSON

  for (int i = 0; i < cfg->register_count; i++) {
    const register_config_t *reg = &cfg->registers[i];
    uint8_t result;
    double final_val = 0;
    if (reg->function_code != 3 && reg->function_code != 4) continue;
    result = read_metric(*reg, final_val);

    if (result == node.ku8MBSuccess) {
      Serial.printf("[%s] Scaled: %.2f %s\r\n", reg->key,
                    final_val, reg->unit);
    } else {
      Serial.printf("[%s] Modbus Error: 0x%02X\r\n", reg->key, result);
    }
  }
}

// Hàm mới: đọc Modbus và trả kết quả ra mảng để publish lên MQTT
uint8_t modbus_poll_and_collect(const device_config_t *cfg, modbus_result_t *results, uint8_t max_results) {
  if (cfg->register_count == 0)
    return 0;

  node.begin(cfg->slave_id, Serial2);
  uint8_t collected = 0;

  for (int i = 0; i < cfg->register_count && collected < max_results; i++) {
    modbus_read_one(cfg, i, &results[collected]);
    collected++;
  }

  return collected;
}

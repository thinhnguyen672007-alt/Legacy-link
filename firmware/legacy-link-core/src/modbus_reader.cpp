#include "modbus_reader.h"
#include <ModbusMaster.h>

// Khởi tạo đối tượng Modbus
static ModbusMaster node;

static uint8_t read_metric(const register_config_t &reg, double &value) {
  const bool wide = strcmp(reg.data_type, "UINT32") == 0;
  const uint16_t words = wide ? 2 : 1;
  uint8_t result = reg.function_code == 3
      ? node.readHoldingRegisters(reg.address, words)
      : node.readInputRegisters(reg.address, words);
  if (result != node.ku8MBSuccess) return result;
  const uint16_t first = node.getResponseBuffer(0);
  if (wide) {
    const uint16_t second = node.getResponseBuffer(1);
    const uint32_t raw = reg.low_word_first
        ? (static_cast<uint32_t>(second) << 16) | first
        : (static_cast<uint32_t>(first) << 16) | second;
    value = static_cast<double>(raw) * reg.scale;
  } else {
    value = (strcmp(reg.data_type, "INT16") == 0
        ? static_cast<double>(static_cast<int16_t>(first)) : first) * reg.scale;
  }
  return result;
}

void modbus_init(uint8_t slave_id) {
  node.begin(slave_id, Serial2);
  Serial.printf("[MODBUS] Initialized node for Slave ID: %u\r\n", slave_id);
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
    const register_config_t *reg = &cfg->registers[i];
    uint8_t result;
    double value = 0;
    if (reg->function_code != 3 && reg->function_code != 4) continue;
    result = read_metric(*reg, value);

    strlcpy(results[collected].key, reg->key, sizeof(results[collected].key));

    if (result == node.ku8MBSuccess) {
      results[collected].scaled_value = value;
      results[collected].success = true;
      Serial.printf("[%s] Scaled: %.2f %s\r\n", reg->key,
                    results[collected].scaled_value, reg->unit);
    } else {
      results[collected].scaled_value = 0;
      results[collected].success = false;
      Serial.printf("[%s] Modbus Error: 0x%02X\r\n", reg->key, result);
    }
    collected++;
  }

  return collected;
}

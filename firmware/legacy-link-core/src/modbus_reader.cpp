#include "modbus_reader.h"
#include <ModbusMaster.h>

// Khởi tạo đối tượng Modbus
static ModbusMaster node;

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
    uint16_t data = 0;
    if (reg->function_code == 3) {
      result = node.readHoldingRegisters(reg->address, 1);
    } else if (reg->function_code == 4) {
      result = node.readInputRegisters(reg->address, 1);
    } else {
      continue;
    }

    if (result == node.ku8MBSuccess) {
      data = node.getResponseBuffer(0);
      float final_val = data * reg->scale;
      Serial.printf("[%s] Raw: %u | Scaled: %.2f %s\r\n", reg->key, data,
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
    uint16_t data = 0;

    if (reg->function_code == 3) {
      result = node.readHoldingRegisters(reg->address, 1);
    } else if (reg->function_code == 4) {
      result = node.readInputRegisters(reg->address, 1);
    } else {
      continue;
    }

    strlcpy(results[collected].key, reg->key, sizeof(results[collected].key));

    if (result == node.ku8MBSuccess) {
      data = node.getResponseBuffer(0);
      results[collected].scaled_value = data * reg->scale;
      results[collected].success = true;
      Serial.printf("[%s] Raw: %u | Scaled: %.2f %s\r\n", reg->key, data,
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

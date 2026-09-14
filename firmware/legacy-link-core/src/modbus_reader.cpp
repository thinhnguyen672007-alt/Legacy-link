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
  static uint8_t last_slave_id = 0;
  if (last_slave_id != cfg->slave_id) {
    node.begin(cfg->slave_id, Serial2); // update Slave ID only when it changes
    last_slave_id = cfg->slave_id;
  }
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

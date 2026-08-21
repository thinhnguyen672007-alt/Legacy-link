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

  /* VIẾT CODE CỦA BẠN VÀO ĐÂY */
  // 1. Viết 1 vòng lặp for chạy từ i = 0 đến cfg->register_count
  // 2. Bên trong vòng lặp, tạo 1 biến con trỏ để truy xuất thanh ghi hiện tại:
  //    const register_config_t* reg = &cfg->registers[i];
  // 3. Khai báo: uint8_t result;
  // 4. Khai báo: uint16_t data = 0;
  // 5. Kiểm tra reg->function_code:
  //    - Nếu == 3, thì: result = node.readHoldingRegisters(reg->address, 1);
  //    - Nếu == 4, thì: result = node.readInputRegisters(reg->address, 1);
  //    - Nếu khác 3 và 4: Dùng continue; để bỏ qua.
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

    // 6. Sau khối if-else ở trên, ta in kết quả (Code phần này mình viết sẵn
    // cho bạn):

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

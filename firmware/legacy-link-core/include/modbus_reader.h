#ifndef MODBUS_READER_H
#define MODBUS_READER_H

#include "device_config.h"
#include <Arduino.h>

// Kết quả đọc từ 1 thanh ghi
typedef struct {
    char     key[MAX_REG_KEY_LEN];
    double   scaled_value;
    bool     success;
    double   raw_value;
    uint16_t raw_words[2];
    uint8_t  word_count;
    uint8_t  error_code;
    uint32_t completed_at_ms;
} modbus_result_t;

void modbus_init(uint8_t slave_id);
void modbus_set_idle_callback(void (*callback)());
bool modbus_read_one(const device_config_t *cfg, uint8_t index, modbus_result_t *result);
void modbus_poll_data(const device_config_t *cfg);

// Hàm mới: đọc Modbus VÀ trả kết quả ra mảng để publish lên MQTT
uint8_t modbus_poll_and_collect(const device_config_t *cfg, modbus_result_t *results, uint8_t max_results);

#endif

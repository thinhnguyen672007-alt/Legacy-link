#ifndef MODBUS_READER_H
#define MODBUS_READER_H

#include "device_config.h"
#include <Arduino.h>


void modbus_init(uint8_t slave_id);
void modbus_poll_data(const device_config_t *cfg);

#endif

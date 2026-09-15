#ifndef DEVICE_CONFIG_H
#define DEVICE_CONFIG_H
#include <stdint.h>

#define MAX_DEVICE_ID_LEN   32
#define MAX_DEVICE_NAME_LEN 48
#define MAX_PROTOCOL_LEN    16
#define MAX_REG_KEY_LEN     20
#define MAX_REG_TYPE_LEN    10
#define MAX_REG_UNIT_LEN    8
#define MAX_REGISTERS       16

typedef struct {
    char     key[MAX_REG_KEY_LEN];
    uint16_t address;
    uint8_t  function_code;
    char     data_type[MAX_REG_TYPE_LEN];
    float    scale;
    char     unit[MAX_REG_UNIT_LEN];
} register_config_t;

typedef struct {
    char              device_id[MAX_DEVICE_ID_LEN];
    char              device_name[MAX_DEVICE_NAME_LEN];
    char              protocol[MAX_PROTOCOL_LEN];
    uint32_t          baud_rate;
    uint8_t           parity;
    uint8_t           stop_bits;
    uint8_t           slave_id;
    uint32_t          sampling_interval_ms;
    register_config_t registers[MAX_REGISTERS];
    uint8_t           register_count;
} device_config_t;

#endif
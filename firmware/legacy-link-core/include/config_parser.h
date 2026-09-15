#ifndef CONFIG_PARSER_H
#define CONFIG_PARSER_H

#include "device_config.h"
#include <stdbool.h>

extern device_config_t global_device_config;
extern bool is_config_valid;

bool parse_device_config(const char* json_payload, device_config_t* out);
bool apply_uart_config(const device_config_t* cfg);
void apply_new_configuration(const char* json_payload);
void print_device_config(const device_config_t* cfg);

#endif

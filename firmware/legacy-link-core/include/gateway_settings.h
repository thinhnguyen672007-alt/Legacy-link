#pragma once

// Optional, gitignored site settings. See local_settings.example.h.
#if !defined(LEGACYLINK_HOST_BUILD) && __has_include("local_settings.h")
#include "local_settings.h"
#endif
#ifndef LEGACYLINK_WIFI_SSID
#define LEGACYLINK_WIFI_SSID "YOUR_WIFI_SSID"
#endif
#ifndef LEGACYLINK_WIFI_PASSWORD
#define LEGACYLINK_WIFI_PASSWORD "YOUR_WIFI_PASSWORD"
#endif
#ifndef LEGACYLINK_MQTT_HOST
#define LEGACYLINK_MQTT_HOST "192.168.1.100"
#endif
#ifndef LEGACYLINK_MQTT_PORT
#define LEGACYLINK_MQTT_PORT 1883
#endif
#ifndef LEGACYLINK_MQTT_USER
#define LEGACYLINK_MQTT_USER "legacy_admin"
#endif
#ifndef LEGACYLINK_MQTT_PASSWORD
#define LEGACYLINK_MQTT_PASSWORD "legacy_secret_2026"
#endif
#ifndef LEGACYLINK_NTP_SERVER
#define LEGACYLINK_NTP_SERVER "pool.ntp.org"
#endif
#ifndef LEGACYLINK_RS485_DE_RE_PIN
#define LEGACYLINK_RS485_DE_RE_PIN -1
#endif
static_assert(LEGACYLINK_RS485_DE_RE_PIN == -1 ||
              (LEGACYLINK_RS485_DE_RE_PIN >= 0 && LEGACYLINK_RS485_DE_RE_PIN <= 33 &&
               !(LEGACYLINK_RS485_DE_RE_PIN >= 6 && LEGACYLINK_RS485_DE_RE_PIN <= 11) &&
               LEGACYLINK_RS485_DE_RE_PIN != 16 && LEGACYLINK_RS485_DE_RE_PIN != 17),
              "Choose an output GPIO separate from flash and UART2, or -1 for automatic direction");

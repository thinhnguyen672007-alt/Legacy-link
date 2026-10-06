#pragma once
// Copy to local_settings.h (gitignored) and fill in this installation's values.
#define LEGACYLINK_WIFI_SSID "YOUR_WIFI_SSID"
#define LEGACYLINK_WIFI_PASSWORD "YOUR_WIFI_PASSWORD"
#define LEGACYLINK_MQTT_HOST "192.168.1.100"
#define LEGACYLINK_MQTT_PORT 1883
#define LEGACYLINK_MQTT_USER "esp32"
#define LEGACYLINK_MQTT_PASSWORD "YOUR_BROKER_PASSWORD"
#define LEGACYLINK_NTP_SERVER "pool.ntp.org"
// -1: adapter handles direction automatically.
// For a manual adapter, tie DE and /RE to a suitable GPIO, e.g. 23, after
// checking the adapter's electrical compatibility and wiring. HIGH transmits.
#define LEGACYLINK_RS485_DE_RE_PIN -1

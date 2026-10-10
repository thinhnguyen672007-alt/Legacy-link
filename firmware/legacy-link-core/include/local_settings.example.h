#pragma once
// Copy to local_settings.h (gitignored) and fill in this installation's values.
#define LEGACYLINK_WIFI_SSID "YOUR_WIFI_SSID"
#define LEGACYLINK_WIFI_PASSWORD "YOUR_WIFI_PASSWORD"
#define LEGACYLINK_MQTT_HOST "192.168.1.100"
// Plain MQTT over the agreed private demo LAN. Host is an IP/DNS name,
// not a mqtt:// URL. Port 8883 alone does not enable TLS in this firmware.
#define LEGACYLINK_MQTT_PORT 1883
// Shared hackathon account provisioned by the infrastructure team.
#define LEGACYLINK_MQTT_USER "legacy_admin"
#define LEGACYLINK_MQTT_PASSWORD "legacy_secret_2026"
#define LEGACYLINK_NTP_SERVER "pool.ntp.org"
// -1: adapter handles direction automatically.
// For a manual adapter, tie DE and /RE to a suitable GPIO, e.g. 23, after
// checking the adapter's electrical compatibility and wiring. HIGH transmits.
#define LEGACYLINK_RS485_DE_RE_PIN -1

#include "config_parser.h"
#include "modbus_reader.h"
#include "alarm_monitor.h"
#include <Arduino.h>
#include <ArduinoJson.h>
#include <PubSubClient.h>
#include <WiFi.h>
#include <time.h>
#include <sys/time.h>
#include <math.h>
#include <memory>
#include <new>

// ============================================================
// CẤU HÌNH MẠNG - Đổi theo môi trường của team
// ============================================================
const char *ssid = "YOUR_WIFI_SSID";
const char *password = "YOUR_WIFI_PASSWORD";
const char *mqtt_server = "192.168.1.100"; // IP máy chạy Docker Mosquitto của Huy
const int mqtt_port = 1883;
const char *mqtt_user = "esp32";           // Khớp với passwd của Mosquitto
const char *mqtt_pass = "esp32";           // Khớp với passwd của Mosquitto
const char *ntp_server_1 = "pool.ntp.org";
const char *ntp_server_2 = "time.nist.gov";

WiFiClient espClient;
PubSubClient mqttClient(espClient);

// Stable gateway identity allows provisioning before any device config exists.
static char gateway_id[13];
static char mqtt_client_id[80];
static char config_topic[80];
static char device_config_topic[80];
static bool pending_device_config = false;
static constexpr size_t CONFIG_BUFFER_SIZE = 4096;
static char pending_config[CONFIG_BUFFER_SIZE];
static bool config_pending = false;
static AlarmMonitor alarm_monitor;
static bool wifi_was_connected = false;
static uint32_t last_wifi_retry = 0;
static constexpr uint32_t WIFI_RETRY_INTERVAL_MS = 10000;

// Trả về epoch MILLISECONDS (13 chữ số) khớp với backend validation
// Backend kiểm tra: timestamp >= Date.UTC(2020,0,1) = 1577836800000
unsigned long long current_epoch_ms() {
  timeval now = {};
  if (gettimeofday(&now, nullptr) != 0 || now.tv_sec < 1700000000) return 0;
  return static_cast<unsigned long long>(now.tv_sec) * 1000ULL + now.tv_usec / 1000;
}

// ============================================================
// MQTT TOPIC FORMAT (khớp với backend/src/config.js)
// Topic: legacy-link/devices/{deviceId}/telemetry
// Topic: legacy-link/devices/{deviceId}/status
// Topic: legacy-link/devices/{deviceId}/alarm
// ============================================================

// --- HÀM PUBLISH TELEMETRY LÊN MQTT ---
// Payload format khớp với backend/src/validation/telemetry.js:
// { "deviceId": "CNC-001", "timestamp": 1690000000000, "schemaVersion": 1, "metrics": {"temp": 65.4} }
void publish_telemetry(const device_config_t *cfg, modbus_result_t *results, uint8_t count) {
  if (!mqttClient.connected() || count == 0) return;

  StaticJsonDocument<1024> doc;
  doc["deviceId"] = cfg->device_id;

  unsigned long long ts = current_epoch_ms();
  if (ts == 0) {
    Serial.println("[MQTT] Skip telemetry: NTP time not synchronized yet");
    return;
  }
  doc["timestamp"] = ts;
  doc["schemaVersion"] = 1;  // Backend bắt buộc field này

  JsonObject metrics = doc.createNestedObject("metrics");
  for (uint8_t i = 0; i < count; i++) {
    if (results[i].success && isfinite(results[i].scaled_value)) {
      metrics[results[i].key] = results[i].scaled_value;
    }
  }

  // Xây topic: legacy-link/devices/{deviceId}/telemetry
  char topic[80];
  snprintf(topic, sizeof(topic), "legacy-link/devices/%s/telemetry", cfg->device_id);

  if (metrics.size() == 0 || doc.overflowed()) return;
  char payload[1024];
  if (measureJson(doc) >= sizeof(payload)) return;
  size_t len = serializeJson(doc, payload, sizeof(payload));

  if (mqttClient.publish(topic, payload)) {
    Serial.printf("[MQTT] Published %u bytes to %s\r\n", len, topic);
  } else {
    Serial.println("[MQTT] Publish FAILED");
  }
}

bool publish_alarm(const device_config_t *cfg, const alarm_config_t *alarm,
                   double value, uint64_t timestamp) {
  if (!mqttClient.connected() || timestamp == 0 || !isfinite(value)) return false;
  StaticJsonDocument<384> doc;
  doc["deviceId"] = cfg->device_id;
  doc["timestamp"] = timestamp;
  doc["schemaVersion"] = 1;
  doc["code"] = alarm->code;
  doc["severity"] = alarm->severity;
  doc["value"] = value;
  char topic[80], payload[384];
  snprintf(topic, sizeof(topic), "legacy-link/devices/%s/alarm", cfg->device_id);
  if (doc.overflowed() || measureJson(doc) >= sizeof(payload)) return false;
  serializeJson(doc, payload, sizeof(payload));
  return mqttClient.publish(topic, payload, false);
}

// --- HÀM PUBLISH DEVICE STATUS ---
// Backend validateStatus() yêu cầu: status là boolean, timestamp epoch ms, schemaVersion = 1
void publish_status(const device_config_t *cfg, bool is_online) {
  if (!mqttClient.connected()) return;

  unsigned long long ts = current_epoch_ms();
  if (ts == 0) return;  // NTP chưa đồng bộ, bỏ qua

  StaticJsonDocument<256> doc;
  doc["deviceId"] = cfg->device_id;
  doc["timestamp"] = ts;
  doc["schemaVersion"] = 1;
  doc["status"] = is_online;  // boolean: true/false (không phải string)

  char topic[80];
  snprintf(topic, sizeof(topic), "legacy-link/devices/%s/status", cfg->device_id);

  char payload[256];
  serializeJson(doc, payload, sizeof(payload));
  mqttClient.publish(topic, payload, true);
  Serial.printf("[MQTT] Status: %s\r\n", is_online ? "online" : "offline");
}

// Start association without waiting for the access point to become available.
void setup_wifi() {
  WiFi.mode(WIFI_STA);
  wifi_was_connected = false;
  last_wifi_retry = millis();
  WiFi.begin(ssid, password);
  Serial.println("[WIFI] Connecting in background; Serial configuration is available");
}

void maintain_wifi() {
  if (WiFi.status() == WL_CONNECTED) {
    if (!wifi_was_connected) {
      wifi_was_connected = true;
      Serial.println("[WIFI] Connected; starting time synchronization");
      configTime(0, 0, ntp_server_1, ntp_server_2);
    }
    return;
  }

  const uint32_t now = millis();
  if (wifi_was_connected) {
    wifi_was_connected = false;
    last_wifi_retry = now;
    // Close the old transport so MQTT reconnects and restores subscriptions.
    // Do not send MQTT DISCONNECT on an unexpected link loss: let the broker
    // publish the registered Last Will for this session.
    espClient.stop();
    Serial.println("[WIFI] Disconnected; continuing local polling");
  }
  if (static_cast<uint32_t>(now - last_wifi_retry) >= WIFI_RETRY_INTERVAL_MS) {
    last_wifi_retry = now;
    WiFi.reconnect();
    Serial.println("[WIFI] Retrying connection");
  }
}

// --- HÀM RECONNECT MQTT (Non-blocking, thử 1 lần rồi thôi) ---
void reconnect_mqtt() {
  if (mqttClient.connected()) return;
  if (WiFi.status() != WL_CONNECTED) return;

  Serial.print("Attempting MQTT connection...");

  bool connected = false;
  if (is_config_valid) {
    const uint64_t timestamp = current_epoch_ms();
    if (!timestamp) return; // Never register a will with an invalid epoch.
    snprintf(mqtt_client_id, sizeof(mqtt_client_id), "legacy-link-%s-%s", global_device_config.device_id, gateway_id);
    snprintf(device_config_topic, sizeof(device_config_topic), "legacy-link/devices/%s/config", global_device_config.device_id);
    char will_topic[80], will_payload[256];
    snprintf(will_topic, sizeof(will_topic), "legacy-link/devices/%s/status", global_device_config.device_id);
    StaticJsonDocument<256> will;
    will["schemaVersion"] = 1;
    will["deviceId"] = global_device_config.device_id;
    will["timestamp"] = timestamp;
    will["status"] = false;
    serializeJson(will, will_payload, sizeof(will_payload));
    connected = mqttClient.connect(mqtt_client_id, mqtt_user, mqtt_pass, will_topic, 1, true, will_payload);
  } else {
    connected = mqttClient.connect(mqtt_client_id, mqtt_user, mqtt_pass);
  }
  if (connected) {
    Serial.println("connected!");

    if (!mqttClient.subscribe(config_topic, 1) ||
        (is_config_valid && !mqttClient.subscribe(device_config_topic, 1))) {
      Serial.println("[MQTT] Config subscription failed; reconnecting on next retry");
      mqttClient.disconnect();
      return;
    }
    Serial.printf("[MQTT] Config topic: %s\r\n", config_topic);
    if (is_config_valid) publish_status(&global_device_config, true);
  } else {
    Serial.print("failed, rc=");
    Serial.println(mqttClient.state());
  }
}

// Copy the MQTT-owned bytes before returning; apply outside the callback.
void mqtt_callback(char *topic, byte *payload, unsigned int length) {
  const bool device_topic = device_config_topic[0] && !strcmp(topic, device_config_topic);
  if (strcmp(topic, config_topic) != 0 && !device_topic) return;
  if (length == 0 || length >= sizeof(pending_config) || memchr(payload, '\0', length)) {
    Serial.println("[CONFIG] Rejected: empty, oversized or NUL-containing MQTT payload");
    return;
  }
  memcpy(pending_config, payload, length);
  pending_config[length] = '\0';
  config_pending = true;
  pending_device_config = device_topic;
}

// Reconnect only on identity changes, otherwise a retained config would cause
// a reconnect loop. Device-scoped updates cannot reassign the gateway.
bool apply_runtime_config(const char *payload, bool device_scoped = false) {
  std::unique_ptr<device_config_t> storage(new (std::nothrow) device_config_t{});
  if (!storage) return false;
  device_config_t &next = *storage;
  if (!parse_device_config(payload, &next)) {
    Serial.println("[CONFIG] Rejected: invalid configuration; keeping current config");
    return false;
  }
  if (device_scoped && (!is_config_valid || strcmp(next.device_id, global_device_config.device_id))) {
    Serial.println("[CONFIG] Rejected: deviceId does not match config topic");
    return false;
  }
  if (is_config_valid && !memcmp(&next, &global_device_config, sizeof(next))) return true;
  const bool identity_changed = !is_config_valid || strcmp(next.device_id, global_device_config.device_id);
  if (identity_changed && is_config_valid) publish_status(&global_device_config, false);
  if (!apply_new_configuration(payload)) return false;
  alarm_monitor.reset();
  if (identity_changed) {
    mqttClient.disconnect();
    device_config_topic[0] = '\0';
    reconnect_mqtt();
  } else publish_status(&global_device_config, true);
  return true;
}

// ============================================================
// HÀM SETUP CHÍNH
// ============================================================
void setup() {
  Serial.begin(115200);
  delay(1000);

  Serial.println("\n========================================");
  Serial.println("   LEGACY LINK GATEWAY v0.2 - ONLINE   ");
  Serial.println("========================================");
  Serial.println("  Hardware : ESP32 DevKit v1");
  Serial.printf("  Free RAM : %u bytes\r\n", ESP.getFreeHeap());

  // Kết nối Wi-Fi (nếu thất bại vẫn chạy offline mode)
  setup_wifi();

  const uint64_t chip_id = ESP.getEfuseMac();
  snprintf(gateway_id, sizeof(gateway_id), "%04X%08X",
           static_cast<unsigned int>(chip_id >> 32), static_cast<unsigned int>(chip_id));
  snprintf(mqtt_client_id, sizeof(mqtt_client_id), "legacy-link-%s", gateway_id);
  snprintf(config_topic, sizeof(config_topic), "legacy-link/gateways/%s/config", gateway_id);
  Serial.printf("[MQTT] Gateway ID: %s; config topic: %s\r\n", gateway_id, config_topic);

  // Cấu hình MQTT Broker
  mqttClient.setServer(mqtt_server, mqtt_port);
  mqttClient.setCallback(mqtt_callback);
  // Include MQTT header and topic overhead in addition to the config payload.
  if (!mqttClient.setBufferSize(CONFIG_BUFFER_SIZE + 128)) {
    Serial.println("[MQTT] Failed to allocate configuration receive buffer");
  }

  Serial.println("  Status   : Waiting for JSON config...");
  Serial.println("========================================");
  Serial.println("Paste JSON config and press Enter:\n");
}

// ============================================================
// HÀM LOOP CHÍNH
// ============================================================
void loop() {
  maintain_wifi();
  // 1. Giữ kết nối MQTT sống (thử reconnect mỗi 5 giây nếu mất)
  static unsigned long last_mqtt_retry = 0;
  if (!mqttClient.connected() && millis() - last_mqtt_retry >= 5000) {
    last_mqtt_retry = millis();
    reconnect_mqtt();
  }
  if (mqttClient.connected()) {
    mqttClient.loop();
  }

  if (config_pending) {
    config_pending = false;
    apply_runtime_config(pending_config, pending_device_config);
  }

  // 2. Nhận JSON qua Serial Monitor để cấu hình (backup khi chưa có MQTT config)
  static char inputBuffer[CONFIG_BUFFER_SIZE];
  static size_t inputLength = 0;
  static bool inputOverflow = false;

  while (Serial.available() > 0) {
    const char receivedByte = static_cast<char>(Serial.read());

    if (receivedByte == '\r') {
      continue;
    }

    if (receivedByte == '\n') {
      if (inputOverflow) {
        inputOverflow = false;
        inputLength = 0;
        continue;
      }
      inputBuffer[inputLength] = '\0';

      if (inputLength > 0) {
        Serial.printf("\n[RECV] %u bytes received\r\n", inputLength);
        apply_runtime_config(inputBuffer);
      }

      inputLength = 0;
    } else if (inputOverflow) {
      continue; // Discard the entire oversized line, including any valid-looking suffix.
    } else if (receivedByte == '\0') {
      inputOverflow = true;
      inputLength = 0;
      Serial.println("[CONFIG] Rejected: NUL-containing Serial input");
    } else if (inputLength < sizeof(inputBuffer) - 1) {
      inputBuffer[inputLength++] = receivedByte;
    } else {
      inputLength = 0;
      inputOverflow = true;
      Serial.println("[ERROR] Input too long (max 4095 bytes); discarding line");
    }
  }

  // 3. Chạy vòng lặp Modbus non-blocking + Publish MQTT
  if (is_config_valid) {
    static unsigned long last_poll_time = 0;
    unsigned long current_time = millis();

    if (current_time - last_poll_time >= global_device_config.sampling_interval_ms) {
      last_poll_time = current_time;

      // Đọc Modbus và thu thập kết quả
      modbus_result_t results[MAX_REGISTERS];
      uint8_t count = modbus_poll_and_collect(&global_device_config, results, MAX_REGISTERS);

      alarm_monitor.evaluate(&global_device_config, results, count, current_epoch_ms(), publish_alarm);

      // Publish lên MQTT (nếu đang kết nối)
      if (mqttClient.connected() && count > 0) {
        publish_telemetry(&global_device_config, results, count);
      }
    }
  }

  // 4. Publish heartbeat status mỗi 30 giây
  if (is_config_valid && mqttClient.connected()) {
    static unsigned long last_status_time = 0;
    if (millis() - last_status_time >= 30000) {
      last_status_time = millis();
      publish_status(&global_device_config, true);
    }
  }
}

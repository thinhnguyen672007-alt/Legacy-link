#include "config_parser.h"
#include "modbus_reader.h"
#include "alarm_monitor.h"
#include <Arduino.h>
#include <ArduinoJson.h>
#include <PubSubClient.h>
#include <WiFi.h>
#include <time.h>
#include <math.h>

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
static char mqtt_client_id[32];
static char config_topic[80];
static constexpr size_t CONFIG_BUFFER_SIZE = 4096;
static char pending_config[CONFIG_BUFFER_SIZE];
static bool config_pending = false;
static AlarmMonitor alarm_monitor;

// Trả về epoch MILLISECONDS (13 chữ số) khớp với backend validation
// Backend kiểm tra: timestamp >= Date.UTC(2020,0,1) = 1577836800000
unsigned long long current_epoch_ms() {
  time_t now = time(nullptr);
  if (now < 1700000000) return 0;  // NTP chưa đồng bộ
  return (unsigned long long)(now) * 1000ULL;
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
                   float value, uint64_t timestamp) {
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

// --- HÀM SETUP WIFI ---
void setup_wifi() {
  delay(10);
  Serial.println();
  Serial.print("Connecting to WiFi: ");
  Serial.println(ssid);

  WiFi.begin(ssid, password);

  int retries = 0;
  while (WiFi.status() != WL_CONNECTED && retries < 40) {
    delay(500);
    Serial.print(".");
    retries++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("");
    Serial.println("WiFi connected!");
    Serial.print("IP address: ");
    Serial.println(WiFi.localIP());
    configTime(0, 0, ntp_server_1, ntp_server_2);
  } else {
    Serial.println("\n[WIFI] Connection FAILED - running in offline mode");
  }
}

// --- HÀM RECONNECT MQTT (Non-blocking, thử 1 lần rồi thôi) ---
void reconnect_mqtt() {
  if (mqttClient.connected()) return;
  if (WiFi.status() != WL_CONNECTED) return;

  Serial.print("Attempting MQTT connection...");

  // Kết nối với username/password khớp với Mosquitto auth
  if (mqttClient.connect(mqtt_client_id, mqtt_user, mqtt_pass)) {
    Serial.println("connected!");

    if (!mqttClient.subscribe(config_topic, 1)) {
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
  if (strcmp(topic, config_topic) != 0) return;
  if (length == 0 || length >= sizeof(pending_config) || memchr(payload, '\0', length)) {
    Serial.println("[CONFIG] Rejected: empty, oversized or NUL-containing MQTT payload");
    return;
  }
  memcpy(pending_config, payload, length);
  pending_config[length] = '\0';
  config_pending = true;
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
    if (apply_new_configuration(pending_config)) {
      alarm_monitor.reset();
      publish_status(&global_device_config, true);
    }
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
        if (apply_new_configuration(inputBuffer)) {
          alarm_monitor.reset();
          publish_status(&global_device_config, true);
        }
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

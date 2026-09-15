#include "config_parser.h"
#include "modbus_reader.h"
#include <Arduino.h>
#include <ArduinoJson.h>
#include <PubSubClient.h>
#include <WiFi.h>

// ============================================================
// CẤU HÌNH MẠNG - Đổi theo môi trường của team
// ============================================================
const char *ssid = "YOUR_WIFI_SSID";
const char *password = "YOUR_WIFI_PASSWORD";
const char *mqtt_server = "192.168.1.100"; // IP máy chạy Docker Mosquitto của Huy
const int mqtt_port = 1883;
const char *mqtt_user = "esp32";           // Khớp với passwd của Mosquitto
const char *mqtt_pass = "esp32";           // Khớp với passwd của Mosquitto

WiFiClient espClient;
PubSubClient mqttClient(espClient);

// ============================================================
// MQTT TOPIC FORMAT (khớp với backend/src/config.js)
// Topic: legacy-link/devices/{deviceId}/telemetry
// Topic: legacy-link/devices/{deviceId}/status
// Topic: legacy-link/devices/{deviceId}/alarm
// ============================================================

// --- HÀM PUBLISH TELEMETRY LÊN MQTT ---
// Payload format khớp với backend/src/validation/telemetry.js:
// { "deviceId": "CNC-001", "timestamp": 1690000000, "metrics": {"temp": 65.4, "rpm": 8500} }
void publish_telemetry(const device_config_t *cfg, modbus_result_t *results, uint8_t count) {
  if (!mqttClient.connected() || count == 0) return;

  StaticJsonDocument<512> doc;
  doc["deviceId"] = cfg->device_id;

  // ESP32 không có RTC, dùng millis() tạm. Khi có NTP sẽ dùng epoch thật.
  // Backend sẽ validate timestamp nằm trong khoảng hợp lý.
  doc["timestamp"] = (unsigned long)(millis()); // TODO: Thay bằng NTP epoch ms

  JsonObject metrics = doc.createNestedObject("metrics");
  for (uint8_t i = 0; i < count; i++) {
    if (results[i].success) {
      metrics[results[i].key] = serialized(String(results[i].scaled_value, 2));
    }
  }

  // Xây topic: legacy-link/devices/{deviceId}/telemetry
  char topic[80];
  snprintf(topic, sizeof(topic), "legacy-link/devices/%s/telemetry", cfg->device_id);

  char payload[512];
  size_t len = serializeJson(doc, payload, sizeof(payload));

  if (mqttClient.publish(topic, payload)) {
    Serial.printf("[MQTT] Published %u bytes to %s\r\n", len, topic);
  } else {
    Serial.println("[MQTT] Publish FAILED");
  }
}

// --- HÀM PUBLISH DEVICE STATUS ---
void publish_status(const device_config_t *cfg, const char *status_str) {
  if (!mqttClient.connected()) return;

  StaticJsonDocument<256> doc;
  doc["deviceId"] = cfg->device_id;
  doc["timestamp"] = (unsigned long)(millis());
  doc["status"] = status_str;
  doc["freeHeap"] = ESP.getFreeHeap();
  doc["uptime"] = millis() / 1000;

  char topic[80];
  snprintf(topic, sizeof(topic), "legacy-link/devices/%s/status", cfg->device_id);

  char payload[256];
  serializeJson(doc, payload, sizeof(payload));
  mqttClient.publish(topic, payload);
  Serial.printf("[MQTT] Status: %s\r\n", status_str);
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
  if (mqttClient.connect("LegacyLink_ESP32_01", mqtt_user, mqtt_pass)) {
    Serial.println("connected!");

    // Subscribe topic cấu hình từ Backend (tương lai)
    // mqttClient.subscribe("legacy-link/devices/+/config");
  } else {
    Serial.print("failed, rc=");
    Serial.println(mqttClient.state());
  }
}

// --- MQTT CALLBACK (nhận cấu hình từ Backend - tương lai) ---
void mqtt_callback(char *topic, byte *payload, unsigned int length) {
  Serial.printf("[MQTT] Received %u bytes on topic: %s\r\n", length, topic);

  // Tạm thời chỉ log, sau này sẽ parse JSON và gọi apply_new_configuration()
  char buffer[1024];
  if (length < sizeof(buffer)) {
    memcpy(buffer, payload, length);
    buffer[length] = '\0';
    Serial.printf("[MQTT] Payload: %s\r\n", buffer);
  }
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

  // Cấu hình MQTT Broker
  mqttClient.setServer(mqtt_server, mqtt_port);
  mqttClient.setCallback(mqtt_callback);
  mqttClient.setBufferSize(1024); // Tăng buffer cho payload lớn

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

  // 2. Nhận JSON qua Serial Monitor để cấu hình (backup khi chưa có MQTT config)
  static char inputBuffer[1024];
  static size_t inputLength = 0;

  while (Serial.available() > 0) {
    const char receivedByte = static_cast<char>(Serial.read());

    if (receivedByte == '\r') {
      continue;
    }

    if (receivedByte == '\n') {
      inputBuffer[inputLength] = '\0';

      if (inputLength > 0) {
        Serial.printf("\n[RECV] %u bytes received\r\n", inputLength);
        apply_new_configuration(inputBuffer);
        Serial.printf("[SYS] Free RAM after config: %u bytes\r\n\n", ESP.getFreeHeap());

        // Publish status khi nhận cấu hình mới thành công
        if (is_config_valid) {
          publish_status(&global_device_config, "configured");
        }
      }

      inputLength = 0;
    } else if (inputLength < sizeof(inputBuffer) - 1) {
      inputBuffer[inputLength++] = receivedByte;
    } else {
      inputLength = 0;
      Serial.println("[ERROR] Input too long (max 1023 bytes)");
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
      publish_status(&global_device_config, "online");
    }
  }
}

#include "config_parser.h"
#include "modbus_reader.h"
#include <Arduino.h>
#include <PubSubClient.h>
#include <WiFi.h>


const char *ssid = "YOUR_WIFI_SSID";
const char *password = "YOUR_WIFI_PASSWORD";
const char *mqtt_server = "192.168.1.100"; // Đổi thành IP Broker của Huy
const int mqtt_port = 1883;

WiFiClient espClient;
PubSubClient mqttClient(espClient);

// --- 2. HÀM SETUP WIFI ---
void setup_wifi() {
  delay(10);
  Serial.println();
  Serial.print("Connecting to WiFi: ");
  Serial.println(ssid);

  WiFi.begin(ssid, password);

  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  Serial.println("");
  Serial.println("WiFi connected!");
  Serial.print("IP address: ");
  Serial.println(WiFi.localIP());
}

// --- 3. HÀM RECONNECT MQTT ---
void reconnect_mqtt() {
  // Loop cho đến khi kết nối lại được
  while (!mqttClient.connected()) {
    Serial.print("Attempting MQTT connection...");

    // Thử kết nối với Client ID "LegacyLink_ESP32_01"
    if (mqttClient.connect("LegacyLink_ESP32_01")) {
      Serial.println("connected");

      // TODO: KHI KẾT NỐI THÀNH CÔNG, BẠN CẦN SUBSCRIBE TOPIC CONFIG Ở ĐÂY:
      // mqttClient.subscribe("denso/gw/config");

    } else {
      Serial.print("failed, rc=");
      Serial.print(mqttClient.state());
      Serial.println(" try again in 5 seconds");
      delay(5000); // Đợi 5s rồi thử lại
    }
  }
}

// --- 4. HÀM SETUP CHÍNH ---
void setup() {
  Serial.begin(115200);
  delay(1000);

  Serial.println("\n========================================");
  Serial.println("   LEGACY LINK GATEWAY v0.1 - ONLINE   ");
  Serial.println("========================================");

  // setup_wifi();

  // Cấu hình MQTT Broker
  mqttClient.setServer(mqtt_server, mqtt_port);

  // TODO: Set hàm callback để hứng JSON (sẽ làm ở bước sau)
  // mqttClient.setCallback(mqtt_callback);
}

// --- 5. HÀM LOOP CHÍNH ---
void loop() {
  // 1. Giữ kết nối MQTT luôn sống (Tự động reconnect nếu rớt mạng)
  // if (!mqttClient.connected()) {
  //   reconnect_mqtt();
  // }
  // mqttClient.loop();

  // Nhận JSON qua Serial Monitor để cấu hình (CẦN THIẾT CHO VIỆC TEST CỨNG)
  static char inputBuffer[512];
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
      }

      inputLength = 0;
    } else if (inputLength < sizeof(inputBuffer) - 1) {
      inputBuffer[inputLength++] = receivedByte;
    } else {
      inputLength = 0;
      Serial.println("[ERROR] Input too long (max 511 bytes)");
    }
  }

  // 2. Chạy vòng lặp Modbus non-blocking (Giữ nguyên logic cũ của bạn)
  if (is_config_valid) {
    static unsigned long last_poll_time = 0;
    unsigned long current_time = millis();

    if (current_time - last_poll_time >= global_device_config.sampling_interval_ms) {
      last_poll_time = current_time;
      modbus_poll_data(&global_device_config);
    }
  }
}

#include <Arduino.h>
#include "config_parser.h"

void setup() {
  Serial.begin(115200);
  delay(1000);

  Serial.println("\n========================================");
  Serial.println("   LEGACY LINK GATEWAY v0.1 - ONLINE   ");
  Serial.println("========================================");
  Serial.println("  Hardware : ESP32 DevKit v1");
  Serial.printf("  Free RAM : %u bytes\r\n", ESP.getFreeHeap());
  Serial.println("  Status   : Waiting for JSON config...");
  Serial.println("========================================");
  Serial.println("Paste JSON config and press Enter:\n");
}

void loop() {
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
}
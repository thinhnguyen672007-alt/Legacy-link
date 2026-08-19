#include <Arduino.h>

void setup() {
    Serial.begin(115200);
    delay(1000); 
    
    Serial.println("\n--- ESP32 LEGACY LINK SẴN SÀNG ---");
    Serial.println("Cáp USB đã kết nối thành công!");
    Serial.println("input smth: ");
}

void loop() {
    static char inputBuffer[128];
    static size_t inputLength = 0;

    while (Serial.available() > 0) {
        const char receivedByte = static_cast<char>(Serial.read());

        if (receivedByte == '\r') {
            continue;
        }

        if (receivedByte == '\n') {
            inputBuffer[inputLength] = '\0';
            Serial.print("[ESP32 Vang Lại]: ");
            Serial.println(inputBuffer);
            inputLength = 0;
        } else if (inputLength < sizeof(inputBuffer) - 1) {
            inputBuffer[inputLength++] = receivedByte;
        } else {
            inputLength = 0;
            Serial.println("[ESP32] Input too long");
        }
    }
}
#include <Arduino.h>

void setup() {
    Serial.begin(115200);
    delay(1000); 
    
    Serial.println("\n--- ESP32 LEGACY LINK SẴN SÀNG ---");
    Serial.println("Cáp USB đã kết nối thành công!");
    Serial.println("input smth: ");
}

void loop() {

    if (Serial.available() > 0) {

        String receivedData = Serial.readStringUntil('\n'); 
        

        Serial.print("[ESP32 Vang Lại]: ");
        Serial.println(receivedData);
    }
}
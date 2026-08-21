/*
 * BÀI TẬP 4: Hiểu về Phạm Vi (Scope) của biến
 * ====================================================
 * C/C++ rất khắt khe về việc một biến được "sinh ra" ở đâu.
 * Đoạn code dưới đây bị lỗi biên dịch vì biến "data" 
 * được khai báo bên trong khối if. Khi ra khỏi dấu } của khối if,
 * biến "data" bị xóa sổ, nên lệnh in bên ngoài không thấy nó nữa.
 * 
 * YÊU CẦU:
 * 1. Hãy sửa lại code để in ra đúng giá trị của data.
 * 2. Lưu ý: Chỉ di chuyển dòng khai báo, không thay đổi logic.
 */
#include <Arduino.h>

void setup() {
    Serial.begin(115200);
}

void loop() {
    bool has_data = true;

    if (has_data) {
        int data = 42; // Khai báo ở đây!
        Serial.println("Reading data...");
    }

    // Lỗi: Biến "data" không tồn tại ở ngoài này!
    Serial.printf("Data is: %d\n", data);
    
    delay(1000);
}

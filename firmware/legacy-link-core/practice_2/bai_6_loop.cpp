/*
 * BÀI TẬP 6: Ôn tập vòng lặp (Giống Modbus)
 * ==============================
 * Bạn đang có một mảng 3 địa chỉ Modbus: {1000, 1002, 1004}.
 * 
 * YÊU CẦU:
 * 1. Viết một vòng lặp for chạy từ biến đếm i = 0 đến < 3.
 * 2. Bên trong vòng lặp, tạo một biến nguyên "int current_addr" và gán giá trị của addresses[i] cho nó.
 * 3. Dùng lệnh if kiểm tra: nếu current_addr == 1002, dùng lệnh "continue;" để bỏ qua.
 * 4. Nếu không, hãy in ra câu: "Dang doc dia chi: [current_addr]" bằng lệnh Serial.printf.
 * 
 * LƯU Ý: Chú ý dấu chấm phẩy (;) kết thúc dòng và dấu ngoặc nhọn ({}) ôm trọn logic.
 */
#include <Arduino.h>

void setup() {
    Serial.begin(115200);
}

void loop() {
    int addresses[3] = {1000, 1002, 1004};

    // VIẾT CODE CỦA BẠN VÀO ĐÂY
    

    delay(5000);
}

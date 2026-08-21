/*
 * BÀI TẬP 5: Lỗi Logic Cổ Điển (if thiếu ngoặc nhọn)
 * ==============================================
 * Người viết đoạn code dưới đây muốn: 
 * NẾU error_code == 0, THÌ in ra "OK" VÀ gửi dữ liệu đi.
 * 
 * TUY NHIÊN, đoạn code dưới đây luôn in ra dòng chữ 
 * "Sending data..." dù error_code đang là 1 (có lỗi).
 * 
 * YÊU CẦU:
 * 1. Hãy thử suy luận xem tại sao lại như vậy. (Gợi ý: lệnh if chỉ quản lý đúng 1 dòng lệnh theo sau nó nếu không có ngoặc nhọn).
 * 2. Thêm dấu ngoặc nhọn {} vào đúng chỗ để nhóm 2 lệnh in lại với nhau, sao cho code chạy đúng ý muốn.
 */
#include <Arduino.h>

void setup() {
    Serial.begin(115200);
}

void loop() {
    int error_code = 1; // 1 nghĩa là có lỗi!

    if (error_code == 0)
        Serial.println("Everything is OK!");
        Serial.println("Sending data to server..."); // Dòng này lúc nào cũng chạy, sai rồi!

    delay(2000);
}

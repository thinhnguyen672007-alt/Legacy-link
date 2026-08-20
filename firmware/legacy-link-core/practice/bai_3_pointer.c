/*
 * BAI TAP 3: Con tro, Struct va Ham ket hop
 * ==========================================
 * Nhiem vu: Viet ham nhan con tro toi struct va dien du lieu vao
 *
 * Day chinh xac la cach parse_device_config() hoat dong trong firmware
 *
 * Yeu cau:
 *   1. Dinh nghia struct "sensor_t" chua: name (char[20]), address (int), scale (float)
 *
 *   2. Viet ham: void fill_sensor(sensor_t* s, const char* name, int address, float scale)
 *      - Ham nhan CON TRO toi struct (khong phai gia tri)
 *      - Dien du lieu vao struct thong qua con tro do
 *      - Dung strlcpy() cho truong name (gioi han 20 ky tu)
 *      - Dung -> de truy cap cac truong
 *
 *   3. Viet ham: void print_sensor(const sensor_t* s)
 *      - Nhan con tro HANG (const) -> chi doc, khong sua
 *      - In tat ca cac truong ra man hinh
 *
 *   4. Trong main():
 *      - Khai bao 1 mang 3 phan tu kieu sensor_t
 *      - Goi fill_sensor() cho tung phan tu
 *      - Goi print_sensor() in tat ca ra
 *
 * Mong doi khi chay:
 *   [0] name=voltage  address=30001  scale=0.10
 *   [1] name=current  address=30002  scale=0.01
 *   [2] name=temp     address=40001  scale=0.10
 *
 * Compile: gcc bai_3_pointer.c -o bai_3 && ./bai_3
 * ==========================================
 */

#include <stdio.h>
#include <string.h>
#include <stdint.h>

/* --- VIET CODE CUA BAN O DUOI DAY --- */




/* --- KET THUC --- */

int main() {

    return 0;
}

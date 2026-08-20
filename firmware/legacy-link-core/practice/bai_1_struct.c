/*
 * BAI TAP 1: Dinh nghia Struct
 * =============================
 * Nhiem vu: Tu tay viet lai 2 struct chinh cua du an (khong nhin file goc!)
 *
 * Yeu cau:
 *   1. Dinh nghia struct "register_config_t" chua cac truong:
 *      - key           : mang char, toi da 20 ky tu
 *      - address       : so nguyen 16-bit khong dau
 *      - function_code : so nguyen 8-bit khong dau
 *      - data_type     : mang char, toi da 10 ky tu
 *      - scale         : so thuc
 *      - unit          : mang char, toi da 8 ky tu
 *
 *   2. Dinh nghia struct "device_config_t" chua cac truong:
 *      - device_id           : mang char, toi da 32 ky tu
 *      - device_name         : mang char, toi da 48 ky tu
 *      - protocol            : mang char, toi da 16 ky tu
 *      - baud_rate           : so nguyen 32-bit khong dau
 *      - parity              : so nguyen 8-bit khong dau
 *      - stop_bits           : so nguyen 8-bit khong dau
 *      - slave_id            : so nguyen 8-bit khong dau
 *      - sampling_interval_ms: so nguyen 32-bit khong dau
 *      - registers           : mang 16 phan tu kieu register_config_t
 *      - register_count      : so nguyen 8-bit khong dau
 *
 *   3. Trong main():
 *      - Khai bao 1 bien kieu device_config_t
 *      - Dung strcpy() gan: device_id = "meter-em6400"
 *      - Gan truc tiep: baud_rate = 9600, slave_id = 1
 *      - In 3 gia tri do ra man hinh bang printf()
 *
 * Compile va chay thu: gcc bai_1.c -o bai_1 && ./bai_1
 * =============================
 */

#include <stdio.h>
#include <stdint.h>
#include <string.h>

#define MAX_REGISTERS 16

/* --- VIET CODE CUA BAN O DUOI DAY --- */




/* --- KET THUC PHAN DINH NGHIA --- */

int main() {
    /* Tao bien va in ket qua o day */

    return 0;
}

/*
 * BAI TAP 2: Ham xu ly chuoi va con tro
 * ======================================
 * Nhiem vu: Tu viet lai cac ham phu cua config_parser.cpp
 *
 * Yeu cau:
 *   Ham 1 — parse_parity(const char* parity_str)
 *     - Tra ve int
 *     - Neu parity_str la "EVEN" → tra ve 2
 *     - Neu parity_str la "ODD"  → tra ve 3
 *     - Mac dinh                 → tra ve 0
 *     - Dung strcmp() de so sanh chuoi
 *
 *   Ham 2 — convert_stop_bits(int stop_bits)
 *     - Tra ve int
 *     - Neu stop_bits == 2 → tra ve 3   (vi enum cua ESP-IDF: STOP_BITS_2 = 3)
 *     - Mac dinh           → tra ve 1
 *
 *   Ham 3 — print_parity(int parity_code)
 *     - Tra ve const char* (chuoi)
 *     - Dich nguoc: 2 → "EVEN", 3 → "ODD", mac dinh → "NONE"
 *
 *   Trong main(): Test 3 ham tren voi cac gia tri khac nhau va in ket qua
 *
 * Compile: gcc bai_2_ham.c -o bai_2 && ./bai_2
 * ======================================
 */

#include <stdio.h>
#include <string.h>

/* --- VIET CODE CUA BAN O DUOI DAY --- */




/* --- KET THUC --- */

int main() {
    /* Test tung ham, vi du:
     * printf("EVEN -> %d\n", parse_parity("EVEN"));   // Mong doi: 2
     * printf("ODD  -> %d\n", parse_parity("ODD"));    // Mong doi: 3
     * printf("NONE -> %d\n", parse_parity("NONE"));   // Mong doi: 0
     * printf("stop 2 -> %d\n", convert_stop_bits(2)); // Mong doi: 3
     * printf("stop 1 -> %d\n", convert_stop_bits(1)); // Mong doi: 1
     */

    return 0;
}

-- Dữ liệu BENCH-01 tùy chọn cho bộ giả lập Modbus; không đại diện máy công nghiệp thật.
-- Truyền gateway ID thật đọc được trên Serial của ESP32, ví dụ:
-- psql "$DATABASE_URL" -v gateway_id=CCDBA7603C64 -f db/seed-bench.sql
-- Địa chỉ 1/2/3 theo bản ghi kiểm thử OpenModSim trong docs/bench-01-handoff-2026-10-08.md.
-- Chạy lại không ghi đè cấu hình của thiết bị đã được đăng ký trước đó.
BEGIN;
CREATE TEMP TABLE bench_gateway (id text CHECK (id ~ '^[A-F0-9]{12}$')) ON COMMIT DROP;
INSERT INTO bench_gateway VALUES (:'gateway_id');
INSERT INTO device (device_id, machine_type, name, protocol, baud_rate, parity,
  stop_bits, slave_id, sampling_interval_ms, gateway_id)
SELECT 'BENCH-01', 'OpenModSim-bench', 'Modbus bench simulator', 'MODBUS_RTU',
  9600, 'NONE', 1, 1, 2000, id FROM bench_gateway
ON CONFLICT (device_id) DO NOTHING;
INSERT INTO register_map (machine_type, metric_key, protocol_address, modicon_address,
  function_code, data_type, scale, unit)
VALUES ('OpenModSim-bench','temperature',1,40002,3,'INT16',0.1,'C'),
       ('OpenModSim-bench','current',2,40003,3,'UINT16',0.01,'A'),
       ('OpenModSim-bench','rpm',3,40004,3,'UINT16',1,'RPM')
ON CONFLICT (machine_type, metric_key) DO NOTHING;
COMMIT;

-- db/seed-demo.sql
-- Du lieu mau de thu nghiem. Chay:
--   docker exec -i legacy-link-postgres psql -U legacy_admin -d legacy_link < backend/db/seed-demo.sql

-- Hai may CNC CUNG LOAI. Chung dung chung ban do thanh ghi.
--
-- gateway_id = dinh danh phan cung cua ESP32. Trong thuc te no la MAC hoac chip
-- ID, dang chuoi hex 12 ky tu. O day dung gia tri gia de thu nghiem.
--
-- ON CONFLICT ... DO UPDATE (khong phai DO NOTHING): de chay lai file nay thi
-- cac dong CU cung duoc cap nhat gateway_id. Voi DO NOTHING, dong cu giu
-- gateway_id = NULL va se khong gui duoc cau hinh.
INSERT INTO device
  (device_id, machine_type, name, protocol, baud_rate, parity, stop_bits, slave_id,
   sampling_interval_ms, gateway_id)
VALUES
  ('esp32-01', 'FANUC-30i', 'CNC so 1', 'MODBUS_RTU', 9600, 'NONE', 1, 1, 1000, 'A1B2C3D4E5F6'),
  ('esp32-03', 'FANUC-30i', 'CNC so 3', 'MODBUS_RTU', 9600, 'NONE', 1, 1, 1000, 'F6E5D4C3B2A1')
ON CONFLICT (device_id) DO UPDATE
  SET gateway_id = EXCLUDED.gateway_id;

-- Ban chung cua loai FANUC-30i.
--
-- alarm_code BAT BUOC khi co alarm_high — xem rang buoc trong schema.sql.
--
-- Vi sao ma phai khai bao tuong minh, khong doan tu ten chi so:
-- cung mot chi so co the ung voi nhieu ma tuy theo may. Vi du chi so `current`
-- co the la OVERCURRENT (dong qua tai) hoac OVERHEAT (dong cao lam nong dong co).
-- Doan sai thi alarm khong bao gio phat dung.
--
-- ON CONFLICT ... DO UPDATE (khong phai DO NOTHING): de chay lai file nay thi
-- cac dong CU cung duoc cap nhat ma alarm. Voi DO NOTHING, dong cu giu nguyen
-- alarm_code = NULL va rang buoc se van bao loi.
INSERT INTO register_map
  (machine_type, metric_key, protocol_address, modicon_address, function_code,
   data_type, scale, unit, alarm_high, alarm_code, alarm_severity, alarm_hysteresis)
VALUES
  ('FANUC-30i', 'temperature', 49, 40050, 3, 'INT16',  0.1, 'C',    90, 'OVERHEAT',  'high',  3),
  ('FANUC-30i', 'speed',        1, 40002, 3, 'UINT16', 1.0, 'rpm', 1800, 'OVERSPEED', 'high', 50),
  ('FANUC-30i', 'torque',       5, 40006, 3, 'UINT16', 0.1, 'Nm',  NULL, NULL,       'high',  0)
ON CONFLICT (machine_type, metric_key) DO UPDATE
  SET alarm_high       = EXCLUDED.alarm_high,
      alarm_code       = EXCLUDED.alarm_code,
      alarm_severity   = EXCLUDED.alarm_severity,
      alarm_hysteresis = EXCLUDED.alarm_hysteresis;

-- Rieng may 3: nhiet do nam o thanh ghi khac.
--
-- Chi khai bao dia chi. Cac truong con lai de NULL, nghia la "lay tu ban chung" —
-- bao gom ca alarm_high, alarm_code, alarm_severity. Nho vay may 3 thua huong
-- nguong 90 do C cua ban chung, chi khac dia chi thanh ghi.
INSERT INTO register_override (device_id, metric_key, protocol_address, modicon_address)
VALUES ('esp32-03', 'temperature', 51, 40052)
ON CONFLICT (device_id, metric_key) DO NOTHING;

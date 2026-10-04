-- db/seed-demo.sql
-- Du lieu mau de thu nghiem. Chay:
--   docker exec -i legacy-link-postgres psql -U legacy_admin -d legacy_link < backend/db/seed-demo.sql

-- Hai may CNC CUNG LOAI. Chung se dung chung ban do thanh ghi.
INSERT INTO device (device_id, machine_type, name) VALUES
  ('esp32-01', 'FANUC-30i', 'CNC so 1'),
  ('esp32-03', 'FANUC-30i', 'CNC so 3')
ON CONFLICT (device_id) DO NOTHING;

-- Ban chung cua loai FANUC-30i.
INSERT INTO register_map
  (machine_type, metric_key, protocol_address, modicon_address, function_code, data_type, scale, unit, alarm_high)
VALUES
  ('FANUC-30i', 'temperature', 49, 40050, 3, 'INT16',  0.1, 'C',    90),
  ('FANUC-30i', 'speed',        1, 40002, 3, 'UINT16', 1.0, 'rpm', 1800),
  ('FANUC-30i', 'torque',       5, 40006, 3, 'UINT16', 0.1, 'Nm',  NULL)
ON CONFLICT (machine_type, metric_key) DO NOTHING;

-- Rieng may 3: nhiet do nam o thanh ghi khac.
-- Chi khai bao dia chi. Cac truong con lai (scale, unit, alarm_high) de NULL,
-- nghia la "lay tu ban chung".
INSERT INTO register_override (device_id, metric_key, protocol_address, modicon_address)
VALUES ('esp32-03', 'temperature', 51, 40052)
ON CONFLICT (device_id, metric_key) DO NOTHING;

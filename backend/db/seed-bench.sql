-- Optional simulator fixture, NOT an industrial machine profile.
-- Gateway is supplied explicitly from ESP32 serial output:
-- psql "$DATABASE_URL" -v gateway_id=CCDBA7603C64 -f db/seed-bench.sql
-- Addresses 1/2/3 match docs/bench-01-handoff-2026-10-08.md (OpenModSim).
-- Existing commissioning results are NEVER overwritten by this fixture.
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

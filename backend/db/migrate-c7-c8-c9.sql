
-- C7-C9 additive upgrade; safe to re-run on existing installations.
BEGIN;
-- Columns already used by commissioning and dashboard code, missing in the old schema.
ALTER TABLE device ADD COLUMN IF NOT EXISTS applied_config jsonb;
ALTER TABLE device ADD COLUMN IF NOT EXISTS config_request_id text;
ALTER TABLE machine_state ADD COLUMN IF NOT EXISTS diagnostics jsonb;
ALTER TABLE machine_state ADD COLUMN IF NOT EXISTS diagnostics_at bigint;
ALTER TABLE telemetry ADD COLUMN IF NOT EXISTS message_id text;
ALTER TABLE telemetry DROP CONSTRAINT IF EXISTS telemetry_device_id_ts_key;
CREATE UNIQUE INDEX IF NOT EXISTS telemetry_legacy_identity ON telemetry(device_id, ts) WHERE message_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS telemetry_message_identity ON telemetry(device_id, message_id) WHERE message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS telemetry_device_time ON telemetry(device_id, ts);

ALTER TABLE alarms ADD COLUMN IF NOT EXISTS event_id text;
ALTER TABLE alarms ADD COLUMN IF NOT EXISTS metric_key text;
ALTER TABLE alarms DROP CONSTRAINT IF EXISTS alarms_device_id_ts_code_key;
CREATE UNIQUE INDEX IF NOT EXISTS alarms_event_identity ON alarms(device_id, event_id);
CREATE INDEX IF NOT EXISTS alarms_device_time ON alarms(device_id, ts);

CREATE TABLE IF NOT EXISTS ingestion_receipt (
  device_id text NOT NULL REFERENCES device(device_id),
  kind text NOT NULL CHECK (kind IN ('telemetry', 'alarm')),
  message_id text NOT NULL,
  payload_hash text NOT NULL,
  committed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(device_id, kind, message_id)
);

COMMIT;

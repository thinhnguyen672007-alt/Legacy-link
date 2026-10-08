-- HTTP readiness observes the separate MQTT consumer through a short-lived heartbeat.
BEGIN;
CREATE TABLE IF NOT EXISTS consumer_health (
  client_id text PRIMARY KEY,
  ready boolean NOT NULL,
  heartbeat_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS alarms_time_id ON alarms(ts DESC,id DESC);
CREATE INDEX IF NOT EXISTS alarms_device_time_id ON alarms(device_id,ts DESC,id DESC);
CREATE INDEX IF NOT EXISTS telemetry_device_time_id ON telemetry(device_id,ts DESC,id DESC);
COMMIT;

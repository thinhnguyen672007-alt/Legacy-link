-- Bản 4: thao tác bền vững, khóa gateway, profile, replay và quan sát vận hành.
BEGIN;
CREATE TABLE IF NOT EXISTS schema_migrations(version integer PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE register_map ADD COLUMN IF NOT EXISTS word_order text NOT NULL DEFAULT 'HIGH_FIRST' CHECK(word_order IN ('HIGH_FIRST','LOW_FIRST'));
ALTER TABLE register_override ADD COLUMN IF NOT EXISTS word_order text CHECK(word_order IN ('HIGH_FIRST','LOW_FIRST'));
CREATE TABLE IF NOT EXISTS gateway_command_lease(
 gateway_id text PRIMARY KEY, operation_id text NOT NULL, expires_at timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS control_operation(
 id text PRIMARY KEY, gateway_id text NOT NULL, data jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS control_operation_gateway ON control_operation(gateway_id,updated_at DESC);
CREATE TABLE IF NOT EXISTS device_config_history(
 id bigserial PRIMARY KEY, device_id text NOT NULL REFERENCES device(device_id), gateway_id text NOT NULL,
 config jsonb NOT NULL, retired_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS device_config_history_lookup ON device_config_history(device_id,retired_at DESC);
CREATE TABLE IF NOT EXISTS device_profile(
 id text NOT NULL, revision integer NOT NULL, name text NOT NULL, config jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(id,revision));
ALTER TABLE consumer_health ADD COLUMN IF NOT EXISTS stats jsonb NOT NULL DEFAULT '{}';
INSERT INTO schema_migrations(version) VALUES (4) ON CONFLICT DO NOTHING;
COMMIT;

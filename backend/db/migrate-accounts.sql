BEGIN;
CREATE TABLE IF NOT EXISTS app_user (
 id uuid PRIMARY KEY, username text UNIQUE NOT NULL,
 password_hash text NOT NULL, role text NOT NULL CHECK(role IN ('viewer','technician','admin')),
 disabled boolean NOT NULL DEFAULT false, must_change_password boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS app_session (
 token_hash text PRIMARY KEY, user_id uuid NOT NULL REFERENCES app_user(id),
 expires_at timestamptz NOT NULL);
CREATE INDEX IF NOT EXISTS app_session_user ON app_session(user_id);
CREATE TABLE IF NOT EXISTS account_audit (
 id bigserial PRIMARY KEY, actor_id uuid REFERENCES app_user(id),
 action text NOT NULL, target text NOT NULL, outcome text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now());
INSERT INTO schema_migrations(version) VALUES(5) ON CONFLICT DO NOTHING;
COMMIT;

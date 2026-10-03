-- db/schema.sql
-- Chay:
--   docker exec -i legacy-link-postgres psql -U legacy_admin -d legacy_link < backend/db/schema.sql

-- Lich su telemetry. Day la bang lon nhat, se phinh theo thoi gian.
CREATE TABLE IF NOT EXISTS telemetry (
  id          bigserial   PRIMARY KEY,
  device_id   text        NOT NULL,
  ts          bigint      NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  metrics     jsonb       NOT NULL,

  -- Chong trung lap khi QoS 1 gui lai cung mot message.
  -- Unique constraint nay cung tu tao index cho (device_id, ts), va PostgreSQL
  -- quet index nguoc duoc, nen KHONG can them index DESC rieng.
  UNIQUE (device_id, ts)
);

-- Trang thai hien tai cua tung thiet bi. Luon chi mot dong moi thiet bi,
-- nen dashboard doc trong vai mili-giay thay vi phai quet ca bang lich su.
CREATE TABLE IF NOT EXISTS machine_state (
  device_id    text        PRIMARY KEY,
  online       boolean     NOT NULL DEFAULT false,
  last_metrics jsonb,
  last_seen_at timestamptz,
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- Su kien alarm. acknowledged_at NULL nghia la chua ai xu ly.
CREATE TABLE IF NOT EXISTS alarms (
  id              bigserial        PRIMARY KEY,
  device_id       text             NOT NULL,
  ts              bigint           NOT NULL,
  received_at     timestamptz      NOT NULL DEFAULT now(),
  code            text             NOT NULL,
  severity        text             NOT NULL,
  value           double precision,
  acknowledged_at timestamptz,

  UNIQUE (device_id, ts, code)
);

-- Ban do thanh ghi cua tung thiet bi. Day la NGUON SU THAT cho ba thu:
--   - chi so nao hop le voi may nao
--   - don vi cua tung chi so
--   - he so nhan da ap dung
-- Backend doc bang nay de gui config xuong ESP32, va de biet cach hien thi.
CREATE TABLE IF NOT EXISTS register_map (
  device_id     text     NOT NULL,
  metric_key    text     NOT NULL,
  address       integer  NOT NULL,
  function_code smallint NOT NULL,
  data_type     text     NOT NULL,
  scale         real     NOT NULL DEFAULT 1.0,
  unit          text,

  PRIMARY KEY (device_id, metric_key)
);

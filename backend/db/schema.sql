-- db/schema.sql
-- Chay tren database trong:
--   docker exec -i legacy-link-postgres psql -U legacy_admin -d legacy_link < backend/db/schema.sql
--
-- File nay TAO MOI cac bang, VA them cot con thieu vao bang da co.
-- No khong xoa du lieu. Chay lai bao nhieu lan cung duoc.

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
--
-- BA MOC THOI GIAN KHAC NHAU, phuc vu ba cau hoi khac nhau:
--
--   last_seen_at       = lan cuoi nghe duoc BAT KY message NAO (gio may chu)
--                        -> thiet bi con song khong?
--
--   last_telemetry_at  = lan cuoi nghe duoc telemetry (gio may chu)
--                        -> so do con moi khong?
--
--   last_telemetry_ts  = timestamp moi nhat cua thiet bi (gio THIET BI)
--                        -> dung de chan message cu ghi de du lieu moi (C3)
--
-- Vi sao phai tach: mot thiet bi co the con song (dang gui heartbeat) nhung so
-- do da cu (cap Modbus dut). Gop ba thu vao mot cot thi khong the phan biet.
CREATE TABLE IF NOT EXISTS machine_state (
  device_id         text        PRIMARY KEY,
  online            boolean     NOT NULL DEFAULT false,
  last_metrics      jsonb,
  last_telemetry_ts bigint,
  last_telemetry_at timestamptz,
  last_seen_at      timestamptz,
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- Cho database da ton tai tu truoc khi bang chua co cac cot nay.
ALTER TABLE machine_state ADD COLUMN IF NOT EXISTS last_telemetry_ts bigint;
ALTER TABLE machine_state ADD COLUMN IF NOT EXISTS last_telemetry_at timestamptz;

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

-- Thiet bi: no la ai, thuoc loai may nao, va noi chuyen voi no the nao.
--
-- Cac cot name..sampling_interval_ms la cau hinh duong truyen. Chung duoc dung
-- de sinh phan dau cua JSON gui xuong ESP32 (xem GET /catalog).
CREATE TABLE IF NOT EXISTS device (
  device_id            text        PRIMARY KEY,
  machine_type         text        NOT NULL,
  name                 text,
  protocol             text        NOT NULL DEFAULT 'MODBUS_RTU',
  baud_rate            integer     NOT NULL DEFAULT 9600,
  parity               text        NOT NULL DEFAULT 'NONE',
  stop_bits            smallint    NOT NULL DEFAULT 1,
  slave_id             smallint    NOT NULL DEFAULT 1,
  sampling_interval_ms integer     NOT NULL DEFAULT 1000,
  created_at           timestamptz NOT NULL DEFAULT now()
);

-- gateway_id = dinh danh phan cung cua ESP32 (vi du MAC hoac chip ID).
--
-- VI SAO CAN: config di XUONG o topic theo deviceId, nhung ACK di LEN o topic
-- theo gatewayId. Backend can biet ca hai moi gui va nhan duoc.
--
-- Ly do ACK dung gatewayId: luc moi khoi dong, ESP32 chua duoc cau hinh nen no
-- CHUA BIET deviceId cua minh. Nhung no luon biet gatewayId.
ALTER TABLE device ADD COLUMN IF NOT EXISTS gateway_id text;

-- Cac dong duoi day danh cho database DA TON TAI tu truoc, khi bang device
-- chua co sau cot cau hinh. Tren database moi tao thi chung khong lam gi.
-- Nho vay file nay chay lai bao nhieu lan cung duoc.
ALTER TABLE device ADD COLUMN IF NOT EXISTS protocol             text     NOT NULL DEFAULT 'MODBUS_RTU';
ALTER TABLE device ADD COLUMN IF NOT EXISTS baud_rate            integer  NOT NULL DEFAULT 9600;
ALTER TABLE device ADD COLUMN IF NOT EXISTS parity               text     NOT NULL DEFAULT 'NONE';
ALTER TABLE device ADD COLUMN IF NOT EXISTS stop_bits            smallint NOT NULL DEFAULT 1;
ALTER TABLE device ADD COLUMN IF NOT EXISTS slave_id             smallint NOT NULL DEFAULT 1;
ALTER TABLE device ADD COLUMN IF NOT EXISTS sampling_interval_ms integer  NOT NULL DEFAULT 1000;

-- Ban do thanh ghi NEN CHUNG theo loai may.
--
-- Hai cot dia chi, co y:
--   modicon_address  = so hieu nguoi doc thay trong tai lieu may (vi du 40050)
--   protocol_address = so thuc te firmware dung khi doc          (vi du 49)
--
-- Cong thuc: protocol_address = modicon_address - 40001  (voi holding register)
--
-- Luu ca hai de nguoi nhap catalog chi phai chep so tu tai lieu, khong phai
-- tu tru. Nham lan o day KHONG bao loi, chi doc sai thanh ghi trong im lang.
CREATE TABLE IF NOT EXISTS register_map (
  machine_type     text     NOT NULL,
  metric_key       text     NOT NULL,
  protocol_address integer  NOT NULL,
  modicon_address  integer,
  function_code    smallint NOT NULL DEFAULT 3,
  data_type        text     NOT NULL DEFAULT 'UINT16',
  scale            real     NOT NULL DEFAULT 1.0,
  unit             text,

  -- Cau hinh alarm. alarm_code BAT BUOC khi co alarm_high — xem rang buoc ben duoi.
  -- Ma alarm KHONG duoc doan tu ten chi so: cung mot chi so co the ung voi nhieu
  -- ma tuy theo may.
  alarm_high       double precision,
  alarm_code       text,
  alarm_critical   double precision,
  alarm_hysteresis double precision NOT NULL DEFAULT 0,
  alarm_severity   text     NOT NULL DEFAULT 'high',
  alarm_low        double precision,

  PRIMARY KEY (machine_type, metric_key)
);

-- Cho database da ton tai tu truoc.
ALTER TABLE register_map ADD COLUMN IF NOT EXISTS alarm_code       text;
ALTER TABLE register_map ADD COLUMN IF NOT EXISTS alarm_critical   double precision;
ALTER TABLE register_map ADD COLUMN IF NOT EXISTS alarm_hysteresis double precision NOT NULL DEFAULT 0;
ALTER TABLE register_map ADD COLUMN IF NOT EXISTS alarm_severity   text     NOT NULL DEFAULT 'high';

-- RANG BUOC: co nguong thi PHAI co ma.
--
-- Firmware TU CHOI TOAN BO config neu mot register co alarm_high ma thieu
-- alarm_code — khong phai bo qua rieng register do. Rang buoc nay bat du lieu sai
-- ngay luc nhap, thay vi de no lam hong ca cau hinh cua ESP32 sau nay.
--
-- DROP truoc ADD de file nay chay lai duoc nhieu lan.
ALTER TABLE register_map DROP CONSTRAINT IF EXISTS register_map_alarm_needs_code;
ALTER TABLE register_map ADD CONSTRAINT register_map_alarm_needs_code
  CHECK (alarm_high IS NULL OR alarm_code IS NOT NULL);

-- Phan KHAC BIET cua tung may so voi ban chung.
--
-- Moi cot deu cho phep NULL, va NULL co nghia la "khong doi, lay tu ban chung".
-- Vi vay bang nay chi chua nhung gi that su khac. May nao giong het ban chung
-- thi khong co dong nao o day — va do la truong hop binh thuong, khong phai loi.
CREATE TABLE IF NOT EXISTS register_override (
  device_id        text     NOT NULL,
  metric_key       text     NOT NULL,
  protocol_address integer,
  modicon_address  integer,
  function_code    smallint,
  data_type        text,
  scale            real,
  unit             text,
  alarm_high       double precision,
  alarm_code       text,
  alarm_critical   double precision,
  alarm_hysteresis double precision,
  alarm_severity   text,
  alarm_low        double precision,

  PRIMARY KEY (device_id, metric_key)
);

-- Cho database da ton tai tu truoc.
--
-- KHONG dat rang buoc "co nguong thi phai co ma" o bang nay. Ly do: mot override
-- co the chi doi nguong (vi du ha tu 90 xuong 85) ma khong nhac lai ma alarm —
-- ma do thua huong tu ban chung. Rang buoc o day se chan nham truong hop do.
--
-- Sau khi ghep, ben doc (db/catalog.js) se kiem tra lai: chi gui alarm khi co
-- du ca nguong lan ma.
ALTER TABLE register_override ADD COLUMN IF NOT EXISTS alarm_code       text;
ALTER TABLE register_override ADD COLUMN IF NOT EXISTS alarm_critical   double precision;
ALTER TABLE register_override ADD COLUMN IF NOT EXISTS alarm_hysteresis double precision;
ALTER TABLE register_override ADD COLUMN IF NOT EXISTS alarm_severity   text;

-- ---------------------------------------------------------------------------
-- Yeu cau gui cau hinh xuong thiet bi.
--
-- VI SAO PHAI LUU TRONG DATABASE, KHONG DUOC LUU TRONG RAM:
--
-- Hai tien trinh HTTP va MQTT chay RIENG BIET nhau:
--   - Tien trinh HTTP TAO yeu cau (khi frontend bam "Ap dung")
--   - Tien trinh MQTT NHAN ACK (vi no dang giu ket noi toi broker)
--
-- Hai tien trinh KHONG chia se bo nho. Bien trong RAM cua tien trinh nay khong
-- ton tai voi tien trinh kia. Nen trang thai BAT BUOC phai di qua database.
--
-- Day khong phai chuyen "thich luu tru" — ma la rang buoc cua kien truc.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS config_request (
  request_id text        PRIMARY KEY,

  -- Topic di xuong theo device, ACK di len theo gateway. Can ca hai.
  device_id  text        NOT NULL,
  gateway_id text        NOT NULL,

  -- pending  = da gui, dang cho ACK
  -- applied  = ESP32 bao da ap dung
  -- unchanged= ESP32 bao cau hinh giong het cai dang chay, khong can doi
  -- rejected = ESP32 tu choi
  -- timeout  = qua han ma khong nghe gi. CHUA BIET ket qua — xem ghi chu duoi.
  status     text        NOT NULL DEFAULT 'pending',

  -- Noi dung da gui. Luu lai de co the gui lai y nguyen khi retry, va de biet
  -- chinh xac minh da gui cai gi.
  payload    jsonb       NOT NULL,

  -- Thong tin lay tu ACK. Tat ca deu co the NULL vi ACK co the thieu truong.
  result     text,
  reason     text,
  persisted  boolean,

  sent_at    timestamptz NOT NULL DEFAULT now(),
  ack_at     timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- MOI GATEWAY CHI MOT YEU CAU DANG CHO.
--
-- Day la partial unique index: no chi ap dung cho cac dong co status='pending'.
-- Cac dong da xong (applied/rejected/timeout) khong bi rang buoc.
--
-- Nho vay database TU CHAN viec gui hai cau hinh cung luc cho mot thiet bi —
-- khong can kiem tra trong code, va khong so race condition.
CREATE UNIQUE INDEX IF NOT EXISTS config_request_one_pending_per_gateway
  ON config_request (gateway_id)
  WHERE status = 'pending';

-- ---------------------------------------------------------------------------
-- Lich su cac lan tien trinh MQTT khoi dong.
--
-- Diagnostic process history only: a gap does not prove samples were lost.
-- Firmware outbox + post-COMMIT ingestion ACK enables replay even over QoS0.
-- A NULL stopped_at means either running or an unclean exit; uptime alone
-- cannot determine the exact crash time, missing samples, or MQTT/DB outages.
CREATE TABLE IF NOT EXISTS service_run (
  id         bigserial   PRIMARY KEY,
  started_at timestamptz NOT NULL DEFAULT now(),
  stopped_at timestamptz
);


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

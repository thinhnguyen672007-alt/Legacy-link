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
  alarm_high       double precision,
  alarm_low        double precision,

  PRIMARY KEY (machine_type, metric_key)
);

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
  alarm_low        double precision,

  PRIMARY KEY (device_id, metric_key)
);

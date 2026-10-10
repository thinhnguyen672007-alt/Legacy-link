// db/catalog.js
// Nhiem vu: doc va ghep catalog thanh ban hoan chinh cho mot thiet bi.
//
// File nay gom hai cau SQL va hai ham dich — tat ca nhung gi lien quan toi viec
// doc bang device, register_map, register_override.
//
// No nam o day chu khong nam trong http/server.js, vi quy tac cua tang db/ la:
// CHI thu muc nay biet SQL.

import { validateConfig } from '../control/validation.js';

let poolPromise;
async function getPool() {
  if (!poolPromise) {
    poolPromise = import('./pool.js').then(({ pool }) => pool);
  }
  return poolPromise;
}

// Firmware chi nhan toi da 4095 byte UTF-8.
//
// Buffer ben firmware la 4096 byte, NHUNG da bao gom byte ket thuc chuoi (NUL).
// Nen phan JSON chi duoc chiem 4095 byte. Con so nay tinh theo BYTE UTF-8,
// khong phai so ky tu — tieng Viet co dau chiem 2-3 byte moi ky tu.
const FIRMWARE_CONFIG_MAX_BYTES = 4095;

// Cau SQL ghep "ban chung cua loai may" voi "phan khac biet cua tung may".
//
// COALESCE(a, b) nghia la: neu a co gia tri thi lay a, neu a la NULL thi lay b.
// Nho vay o bang override de NULL co nghia "khong doi, lay tu ban chung".
const CATALOG_QUERY = `
  SELECT
    b.metric_key,
    COALESCE(o.word_order,b.word_order) AS word_order,
    COALESCE(o.protocol_address, b.protocol_address) AS protocol_address,
    COALESCE(o.modicon_address,  b.modicon_address)  AS modicon_address,
    COALESCE(o.function_code,    b.function_code)    AS function_code,
    COALESCE(o.data_type,        b.data_type)        AS data_type,
    COALESCE(o.scale,            b.scale)            AS scale,
    COALESCE(o.unit,             b.unit)             AS unit,
    COALESCE(o.alarm_high,       b.alarm_high)       AS alarm_high,
    COALESCE(o.alarm_low,        b.alarm_low)        AS alarm_low,
    COALESCE(o.alarm_code,       b.alarm_code)       AS alarm_code,
    COALESCE(o.alarm_critical,   b.alarm_critical)   AS alarm_critical,
    COALESCE(o.alarm_hysteresis, b.alarm_hysteresis) AS alarm_hysteresis,
    COALESCE(o.alarm_severity,   b.alarm_severity)   AS alarm_severity
  FROM register_map b
  LEFT JOIN register_override o
    ON o.device_id = $1 AND o.metric_key = b.metric_key
  WHERE b.machine_type = $2
  ORDER BY b.protocol_address
`;

// Chuyen mot dong database thanh mot phan tu registerMap ma firmware doc duoc.
//
// Chu y ve "address": gui xuong la protocol_address (dia chi tho 0-based),
// KHONG phai modicon_address. Firmware goi readHoldingRegisters(address, 1) va
// ham do nhan dia chi tho. Gui so Modicon xuong la doc sai thanh ghi, khong bao
// loi. Tai lieu backend-alignment.md cung noi ro firmware se KHONG tu tru 40001.
function toFirmwareRegister(row) {
  const register = {
    key: row.metric_key,
    address: row.protocol_address,
    functionCode: row.function_code,
    dataType: row.data_type,
    scale: row.scale,
    unit: row.unit,
    wordOrder: row.word_order,
  };

  // Chi gui alarm khi co DU ca NGUONG lan MA.
  //
  // VI SAO PHAI KIEM TRA:
  // Firmware TU CHOI TOAN BO config neu mot register co alarm_high ma thieu
  // alarm_code — khong phai bo qua rieng register do. Nen mot dong du lieu thieu
  // ma se lam hong CA cau hinh, va ESP32 giu nguyen cau hinh cu.
  //
  // Nghia la sua ngay tho (chi them alarm_high vao day) con TE HON khong sua:
  // hien tai ESP32 van nhan duoc config (chi la khong co alarm), con sau khi
  // sua tho thi no tu choi het.
  //
  // Bo rieng phan alarm thieu la FAIL NHO: register do khong co alarm, nhung
  // cac register khac van hoat dong binh thuong.
  //
  // Tang database da co rang buoc CHECK ngan chan du lieu nay. Day la lop thu
  // hai — phong khi du lieu sai lot vao bang cach khac.
  if (row.alarm_high !== null && row.alarm_code !== null) {
    register.alarm = {
      threshold: row.alarm_high,
      code: row.alarm_code,
      hysteresis: row.alarm_hysteresis,
      severity: row.alarm_severity,
    };
    if (row.alarm_critical !== null) register.alarm.criticalThreshold = row.alarm_critical;
  }

  // alarm_low đã có trong schema; giữ ngưỡng hiệu lực riêng của từng thiết bị.
  if (row.alarm_low != null) register.lowAlarm = { threshold: row.alarm_low, code: 'UNDERHEAT',
    hysteresis: row.alarm_hysteresis, severity: row.alarm_severity };
  return register;
}

// Tra ve catalog day du cho mot thiet bi, hoac null neu khong biet thiet bi do.
//
// Ham tra ve null chu khong nem loi, vi "khong tim thay" la chuyen BINH THUONG,
// khong phai su co. Ben goi se quyet dinh tra ma HTTP nao.
export async function getCatalog(deviceId, db) {
  const database = db ?? (await getPool());
  const deviceResult = await database.query(
    `SELECT device_id, machine_type, name, protocol, baud_rate, parity,
            stop_bits, slave_id, sampling_interval_ms, applied_config
     FROM device
     WHERE device_id = $1`,
    [deviceId]
  );

  if (deviceResult.rowCount === 0) {
    return null;
  }

  const device = deviceResult.rows[0];
  if (device.applied_config) return validateConfig(device.applied_config);
  const registerResult = await database.query(CATALOG_QUERY, [deviceId, device.machine_type]);

  const catalog = {
    deviceId: device.device_id,
    deviceName: device.name,
    protocol: device.protocol,
    baudRate: device.baud_rate,
    parity: device.parity,
    stopBits: device.stop_bits,
    slaveId: device.slave_id,
    samplingIntervalMs: device.sampling_interval_ms,
    registerMap: registerResult.rows.map(toFirmwareRegister),
  };

  // Kiem tra kich thuoc TRUOC khi gui di.
  //
  // Firmware tu choi payload qua lon, va khi bi tu choi thi no giu nguyen cau
  // hinh cu — nghia la ESP32 im lang khong cap nhat. Kiem tra o day de loi hien
  // ra ngay phia backend, thay vi bien thanh "ESP32 khong doi gi ca".
  const size = Buffer.byteLength(JSON.stringify(catalog), 'utf8');

  if (size > FIRMWARE_CONFIG_MAX_BYTES) {
    throw new Error(
      `Catalog vuot gioi han firmware: ${size} byte > ${FIRMWARE_CONFIG_MAX_BYTES}. ` +
        `Thiet bi "${deviceId}" co ${catalog.registerMap.length} thanh ghi.`
    );
  }

  return validateConfig(catalog);
}

// Lay moi thu can thiet de GUI cau hinh xuong mot thiet bi:
//   - config    = JSON gui cho ESP32
//   - gatewayId = de biet cho ACK o topic nao
//
// VI SAO CAN CA HAI:
// config di XUONG o topic theo deviceId, nhung ACK di LEN o topic theo gatewayId.
// Thieu gatewayId thi gui duoc ma khong bao gio biet ket qua.
//
// Tra ve null neu khong biet thiet bi. Nem loi neu thiet bi co nhung chua gan
// gateway — do la du lieu thieu, khong phai "khong tim thay".
export async function getConfigTarget(deviceId) {
  const db = await getPool();
  const config = await getCatalog(deviceId, db);

  if (config === null) {
    return null;
  }

  const result = await db.query('SELECT gateway_id FROM device WHERE device_id = $1', [deviceId]);

  const gatewayId = result.rows[0].gateway_id;

  if (!gatewayId) {
    throw new Error(
      `Thiet bi "${deviceId}" chua co gateway_id trong bang device. ` +
        `Khong biet cho ACK o topic nao, nen khong the gui cau hinh.`
    );
  }

  return { config, gatewayId };
}

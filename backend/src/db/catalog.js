// db/catalog.js
// Nhiem vu: doc va ghep catalog thanh ban hoan chinh cho mot thiet bi.
//
// File nay gom hai cau SQL va mot ham dich — tat ca nhung gi lien quan toi viec
// doc bang device, register_map, register_override.
//
// No nam o day chu khong nam trong http/server.js, vi quy tac cua tang db/ la:
// CHI thu muc nay biet SQL. Nho vay cau hoi "backend doc nhung bang nao" tra loi
// duoc bang cach mo mot thu muc.

import { pool } from './pool.js';

// Cau SQL ghep "ban chung cua loai may" voi "phan khac biet cua tung may".
//
// COALESCE(a, b) nghia la: neu a co gia tri thi lay a, neu a la NULL thi lay b.
// Nho vay o bang override de NULL co nghia "khong doi, lay tu ban chung".
// Toan bo quy tac ghep nam gon trong mot ham SQL, khong phai logic tu viet.
const CATALOG_QUERY = `
  SELECT
    b.metric_key,
    COALESCE(o.protocol_address, b.protocol_address) AS protocol_address,
    COALESCE(o.modicon_address,  b.modicon_address)  AS modicon_address,
    COALESCE(o.function_code,    b.function_code)    AS function_code,
    COALESCE(o.data_type,        b.data_type)        AS data_type,
    COALESCE(o.scale,            b.scale)            AS scale,
    COALESCE(o.unit,             b.unit)             AS unit,
    COALESCE(o.alarm_high,       b.alarm_high)       AS alarm_high,
    COALESCE(o.alarm_low,        b.alarm_low)        AS alarm_low
  FROM register_map b
  LEFT JOIN register_override o
    ON o.device_id = $1 AND o.metric_key = b.metric_key
  WHERE b.machine_type = $2
  ORDER BY b.protocol_address
`;

// Chuyen mot dong database thanh mot phan tu registerMap ma firmware doc duoc.
//
// Chu y: "address" gui xuong la protocol_address (dia chi tho 0-based), KHONG
// phai modicon_address. Firmware goi readHoldingRegisters(address, 1) va ham do
// nhan dia chi tho. Gui so Modicon xuong la doc sai thanh ghi, khong bao loi.
function toFirmwareRegister(row) {
  return {
    key: row.metric_key,
    address: row.protocol_address,
    functionCode: row.function_code,
    dataType: row.data_type,
    scale: row.scale,
    unit: row.unit,
  };
}

// Tra ve catalog day du cho mot thiet bi, hoac null neu khong biet thiet bi do.
//
// Ham tra ve null chu khong nem loi, vi "khong tim thay" la chuyen BINH THUONG,
// khong phai su co. Ben goi se quyet dinh tra ma HTTP nao.
export async function getCatalog(deviceId) {
  const deviceResult = await pool.query(
    `SELECT device_id, machine_type, name, protocol, baud_rate, parity,
            stop_bits, slave_id, sampling_interval_ms
     FROM device
     WHERE device_id = $1`,
    [deviceId],
  );

  if (deviceResult.rowCount === 0) {
    return null;
  }

  const device = deviceResult.rows[0];
  const registerResult = await pool.query(CATALOG_QUERY, [deviceId, device.machine_type]);

  return {
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
}

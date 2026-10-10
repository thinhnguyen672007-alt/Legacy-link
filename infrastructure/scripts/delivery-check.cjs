// Gateway giả dành cho kiểm thử hạ tầng, dùng đúng topic/payload/ACK của backend thật.
// Bốn chế độ: prepare tạo mẫu; outage kiểm tra khi bị ngắt; replay gửi bù; cleanup dọn.
// Chứng minh đường server phục hồi, chưa chứng minh queue RAM hay Wi-Fi của ESP32 thật.
const fs = require('node:fs');
const assert = require('node:assert/strict');
const { randomUUID, randomBytes } = require('node:crypto');
const mqtt = require('mqtt');
const { Pool } = require('pg');
const mode = process.argv[2];
const dir = '/evidence';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const pool = new Pool({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:1500,query_timeout:3000});
pool.on('error',()=>{});
let client;
// Giới hạn 5 phút cho một lần chạy probe. Các truy vấn/MQTT/fetch cũng có timeout riêng,
// vì bài test phải thất bại rõ ràng thay vì chờ vô hạn khi dependency hỏng.
const deadline = setTimeout(()=>{console.error('FAIL deadline');process.exit(1);},300000);
// Client ID riêng và clean session tránh đụng consumer đang chạy hoặc lấy session cũ.
// Không reconnect tự động: bài outage cần quan sát đúng kết nối thất bại hiện tại.
async function connect() {
  client = mqtt.connect(process.env.MQTT_URL,{username:process.env.MQTT_USERNAME,password:process.env.MQTT_PASSWORD,
    clientId:`infra-test-${randomUUID()}`,reconnectPeriod:0,connectTimeout:3000,clean:true});
  await new Promise((resolve,reject)=>{client.once('connect',resolve);client.once('error',reject);});
}
// Chụp các hàng lịch sử trước thử, rồi kiểm tra chúng vẫn tồn tại và không bị đổi.
// Bỏ acknowledged_at vì thao tác xác nhận alarm là thay đổi hợp lệ, tách khỏi nội dung alarm.
// So theo ID từng hàng; tổng số hàng có thể tăng do ESP32 thật vẫn đang gửi.
async function baseline() {
  const result={};
  for(const table of ['telemetry','alarms']) result[table]=(await pool.query(`SELECT to_jsonb(t)-'acknowledged_at' AS row FROM ${table} t ORDER BY id`)).rows.map(x=>x.row);
  return result;
}
async function verifyBaseline(saved) {
  const current=await baseline();
  for(const table of Object.keys(saved)) {
    const rows=new Map(current[table].map(r=>[String(r.id),JSON.stringify(r)]));
    for(const row of saved[table]) assert.equal(rows.get(String(row.id)),JSON.stringify(row),`historical ${table} row ${row.id} changed/missing`);
  }
}
function load() { return JSON.parse(fs.readFileSync(`${dir}/fixture.json`)); }
// Gửi QoS0 để phụ thuộc ACK ứng dụng: broker nhận tin chưa đủ, phải DB COMMIT mới tính.
// Mẫu vẫn nằm trong fixture để replay khi chưa thấy ACK đúng ID.
async function send(event) {
  await client.publishAsync(`legacy-link/devices/${event.deviceId}/${event.kind}`,JSON.stringify(event.payload),{qos:0,retain:false});
}
// HTTP có thể tạm mất kết nối khi watchdog restart Node; tiếp tục đợi có giới hạn.
// Không coi fetch lỗi là 503 hoặc 200: phải nhận đúng HTTP status từ backend.
async function readiness(expected) {
  for(let i=0;i<120;i++) {
    try {
      const response=await fetch('http://backend-api:3000/health/ready',{signal:AbortSignal.timeout(4000)});
      if(response.status===expected) return;
    } catch { /* Node may be restarting; transport failure is not readiness. */ }
    await sleep(1000);
  }
  throw new Error(`HTTP readiness did not become ${expected}`);
}
(async()=>{
 try {
  // ID thiết bị giả ngắn hơn giới hạn 31 ký tự của API; gateway là 12 ký tự HEX hoa.
  // Giữ messageId/eventId ổn định xuyên các lần gửi để thử chống trùng thật.
  if(mode==='prepare') {
    const id=randomUUID(), deviceId=`INFRA-${id.replaceAll("-", "").slice(0,24)}`, gatewayId=randomBytes(6).toString('hex').toUpperCase();
    const saved=await baseline();
    const now=Date.now();
    const events=Array.from({length:4},(_,i)=>({kind:'telemetry',deviceId,payload:{schemaVersion:1,deviceId,gatewayId,messageId:`${id}:${i}`,timestamp:now+i,metrics:{temperature:30+i}}}));
    for(const [i,severity] of ['high','critical'].entries()) events.push({kind:'alarm',deviceId,payload:{schemaVersion:1,deviceId,gatewayId,eventId:`${id}:alarm:${i}`,metricKey:'temperature',timestamp:now,code:'OVERHEAT',severity,value:95+i*10}});
    const fixture={deviceId,gatewayId,events,saved,retainedTopic:`legacy-link/test/persist/${id}`,retainedValue:id};
    // Ghi danh tính fixture trước INSERT: nếu lỗi giữa chừng vẫn biết phải dọn đúng thiết bị.
    // Topic retained riêng kiểm tra broker có giữ dữ liệu qua restart.
    fs.writeFileSync(`${dir}/fixture.json`,JSON.stringify(fixture));
    await pool.query("INSERT INTO device(device_id,machine_type,gateway_id,name,applied_config) VALUES($1,'INFRA-TEST',$2,'Temporary infra acceptance fixture','{\"registerMap\":[{\"key\":\"temperature\"}]}')",[deviceId,gatewayId]);
    await connect();
    await client.publishAsync(fixture.retainedTopic,id,{qos:1,retain:true});
    console.log('PASS prepared 4 telemetry + 2 alarm samples; historical rows snapshotted');
  } else if(mode==='outage') {
    const f=load();
    // Tiến trình HTTP còn sống vẫn có thể thiếu DB/MQTT: live 200 nhưng ready phải 503.
    // Bài tắt broker kiểm tra kết nối MQTT thất bại; các bài khác gửi rồi kiểm tra không ACK thành công.
    assert.equal((await fetch('http://backend-api:3000/health/live',{signal:AbortSignal.timeout(4000)})).status,200);
    await readiness(503);
    if(process.argv[3]==='mosquitto') {
      let connected=false;
      try {await connect();connected=true;} catch {}
      assert.equal(connected,false,'broker should be unavailable');
    } else {
      await connect(); const received=[];
      client.on('message',(_,bytes)=>{try {received.push(JSON.parse(bytes));}catch{}});
      await client.subscribeAsync(`legacy-link/gateways/${f.gatewayId}/ingestion/ack`,{qos:1});
      for(const e of f.events) await send(e);
      await sleep(6500); // Exceeds the backend DB connection timeout.
      assert.equal(received.filter(a=>a.status==='committed').length,0,'success ACK during dependency outage');
    }
    console.log('PASS outage: readiness=503, liveness=200; no committed ACK; simulated queue retained');
  } else if(mode==='replay') {
    const f=load();
    await readiness(200); // Wait for reconnect/watchdog before the bounded ACK retries.
    await connect();const acks=[];let retained;
    client.on('message',(topic,bytes)=>{
      if(topic===f.retainedTopic) {retained=bytes.toString();return;}
      try {acks.push(JSON.parse(bytes));} catch {}
    });
    await client.subscribeAsync([`legacy-link/gateways/${f.gatewayId}/ingestion/ack`,f.retainedTopic],{qos:1});
    // Chỉ chấp nhận ACK đúng schemaVersion, deviceId, loại mẫu, ID và status committed.
    // Tối đa 360 lần, cách nhau 0,5 giây; deadline chung vẫn giới hạn toàn bài.
    // Retry dài ở đây là bài thử server, không có nghĩa firmware có buffer đủ lâu như vậy.
    async function committed(event) {
      const offset=acks.length,id=event.payload.messageId??event.payload.eventId;
      for(let i=0;i<360;i++) {
        await send(event);await sleep(500);
        if(acks.slice(offset).some(a=>a.schemaVersion===1&&a.deviceId===f.deviceId&&a.messageId===id&&a.kind===event.kind&&a.status==='committed'))return;
      }
      throw new Error(`No committed ACK for ${event.kind}/${id}`);
    }
    for(const event of f.events) await committed(event);
    // Mô phỏng người gửi mất ACK lần đầu: gửi lại cùng mẫu phải được ACK nhưng chỉ lưu một lần.
    for(const event of f.events) await committed(event);
    assert.equal(retained,f.retainedValue,'broker retained data lost');
    // Không chỉ đếm: đối chiếu message_id, timestamp gốc và metrics của từng telemetry.
    // 4 telemetry + 2 alarm phải tạo 6 receipt, không tăng thành 12 khi gửi lặp.
    const t=(await pool.query('SELECT message_id,ts,metrics FROM telemetry WHERE device_id=$1 ORDER BY ts',[f.deviceId])).rows;
    assert.equal(t.length,4);
    for(let i=0;i<4;i++) {
      assert.equal(t[i].message_id,`${f.gatewayId}:${f.events[i].payload.messageId}`);
      assert.equal(Number(t[i].ts),f.events[i].payload.timestamp);
      assert.deepEqual(t[i].metrics,f.events[i].payload.metrics);
    }
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM alarms WHERE device_id=$1',[f.deviceId])).rows[0].n,2);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM ingestion_receipt WHERE device_id=$1',[f.deviceId])).rows[0].n,6);
    await verifyBaseline(f.saved);
    await readiness(200);
    // Kiểm tra cả đường trình duyệt -> Nginx -> API, đọc dữ liệu và bảo vệ thao tác ghi.
    // Chỉ ACK một alarm của fixture; không đụng alarm thật của BENCH-01.
    const history=await fetch(`http://api-gateway/machines/${f.deviceId}/telemetry?limit=20`,{headers:{Authorization:`Bearer ${process.env.API_READ_TOKEN}`}});
    assert.equal(history.status,200);assert.equal((await history.json()).items.length,4);
    const alarm=(await pool.query('SELECT id FROM alarms WHERE device_id=$1 LIMIT 1',[f.deviceId])).rows[0];
    const url=`http://api-gateway/alarms/${alarm.id}/ack`;
    const preflight=await fetch(url,{method:'OPTIONS',headers:{Origin:'http://localhost:5173','Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'Authorization'}});
    assert.equal(preflight.status,204);assert.match(preflight.headers.get('access-control-allow-headers'),/Authorization/);
    assert.equal((await fetch(url,{method:'POST'})).status,401,'unauthenticated write must fail');
    assert.equal((await fetch(url,{method:'POST',headers:{Authorization:`Bearer ${process.env.API_WRITE_TOKEN}`}})).status,200,'authenticated write must reach API');
    console.log('PASS replay: 6/6 IDs committed, duplicates stored once, history unchanged, API reads data, write token enforced');
    // Chỉ ghi passed=true sau khi tất cả assert phía trên đã qua; lưu thời điểm làm bằng chứng.
    fs.writeFileSync(`${dir}/result.json`,JSON.stringify({passed:true,samples:6,duplicates:6,historyPreserved:true,apiRead:true,writeAuth:true,at:new Date().toISOString()},null,2));
  } else if(mode==='cleanup') {
    // Cleanup chỉ xóa hàng thuộc deviceId giả đã ghi trong fixture, theo thứ tự bảng liên quan.
    // Payload retained rỗng xóa đúng marker MQTT; sau đó đối chiếu lại lịch sử cũ.
    const f=load();assert.match(f.deviceId,/^INFRA-[a-f0-9-]+$/);
    for(const table of ['ingestion_receipt','telemetry','alarms','machine_state','device']) await pool.query(`DELETE FROM ${table} WHERE device_id=$1`,[f.deviceId]);
    await connect();await client.publishAsync(f.retainedTopic,'',{qos:1,retain:true});
    await verifyBaseline(f.saved);
    console.log('PASS removed only this run\'s synthetic fixture; original history preserved');
  } else throw new Error(`Unknown mode ${mode}`);
 } catch(error) {console.error('FAIL',error.message);process.exitCode=1;}
 finally {if(client) await client.endAsync(true);await pool.end();clearTimeout(deadline);}
})();

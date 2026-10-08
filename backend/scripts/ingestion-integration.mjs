// Isolated integration tests. Requires Docker, postgres:16 and eclipse-mosquitto:2.
// Never connects to the developer's database or broker.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import mqtt from 'mqtt';
import pg from 'pg';
const root = fileURLToPath(new URL('../', import.meta.url));
const suffix = randomUUID().slice(0,8), password = randomUUID();
const pgName = `legacy-ingestion-pg-${suffix}`, mqName = `legacy-ingestion-mq-${suffix}`;
const containers = [], children = [], logs = [], acks = [];
let pool, sourcePool, publisher;
const sleep = ms => new Promise(r => setTimeout(r, ms));
function docker(...args) {
  const p = spawnSync('docker', args, { encoding: 'utf8', timeout: 30000 });
  if (p.status !== 0) throw new Error(`docker ${args[0]}: ${p.stderr.replaceAll(password, '[redacted]')}`);
  return p.stdout.trim();
}
async function waitFor(fn, label) {
  for (let i=0; i<120; i++) { if (await fn()) return; await sleep(100); }
  throw new Error(`Timeout: ${label}`);
}
async function freePort() {
  const s=createServer(); await new Promise(r => s.listen(0,'127.0.0.1',r));
  const port=s.address().port; await new Promise(r=>s.close(r)); return port;
}
function consumer() {
  const child=spawn(process.execPath,['src/index.js'],{cwd:root,env:process.env,stdio:['ignore','pipe','pipe']});
  for (const stream of [child.stdout,child.stderr]) stream.on('data',b=>logs.push(b.toString().replaceAll(password,'[redacted]')));
  children.push(child); return child;
}
async function stop(child) {
  if(child.exitCode!==null) return;
  child.kill('SIGTERM');
  for(let i=0;i<40 && child.exitCode===null;i++) await sleep(100);
  if(child.exitCode===null) child.kill('SIGKILL');
}
async function send(event,kind='telemetry') {
  await publisher.publishAsync(`legacy-link/devices/${event.deviceId}/${kind}`,JSON.stringify(event),{qos:0,retain:false});
}
async function acked(event,kind='telemetry',status='committed') {
  const start=acks.length;
  await send(event,kind);
  await waitFor(()=>acks.slice(start).some(a=>a.messageId===(event.messageId??event.eventId)&&a.kind===kind&&a.status===status),`ACK ${event.messageId??event.eventId}`);
  return acks.slice(start).find(a=>a.messageId===(event.messageId??event.eventId)&&a.kind===kind);
}
function passed(name) { console.log(`PASS ${name}`); }
try {
  const pgPort=await freePort();
  docker('run','-d','--name',pgName,'-e',`POSTGRES_PASSWORD=${password}`,'-e','POSTGRES_USER=reviewer','-e','POSTGRES_DB=review','-p',`127.0.0.1:${pgPort}:5432`,'postgres:16'); containers.push(pgName);
  docker('run','-d','--name',mqName,'-e',`REVIEW_PASSWORD=${password}`,'-p','127.0.0.1::1883','--entrypoint','sh','eclipse-mosquitto:2','-c',
    'mosquitto_passwd -b -c /tmp/test.passwd reviewer "$REVIEW_PASSWORD"; chmod 644 /tmp/test.passwd; printf "listener 1883 0.0.0.0\nallow_anonymous false\npassword_file /tmp/test.passwd\n" > /tmp/test.conf; exec mosquitto -c /tmp/test.conf'); containers.push(mqName);
  const mqPort=docker('port',mqName,'1883/tcp').split(':').at(-1);
  Object.assign(process.env,{MQTT_URL:`mqtt://127.0.0.1:${mqPort}`,MQTT_USERNAME:'reviewer',MQTT_PASSWORD:password,MQTT_QOS:'1',MQTT_CLIENT_ID:`test-consumer-${suffix}`,DATABASE_URL:`postgres://reviewer:${password}@127.0.0.1:${pgPort}/review`});
  pool=new pg.Pool({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:1000}); pool.on('error',()=>{});
  await waitFor(async()=>{try{await pool.query('SELECT 1');return true;}catch{return false;}},'database');
  const schema=readFileSync(`${root}db/schema.sql`,'utf8');
  // Exercise upgrade from the old schema, preserving actual historical rows.
  await pool.query(schema.split('-- C7-C9 additive upgrade')[0]);
  await pool.query(readFileSync(`${root}db/seed-demo.sql`,'utf8'));
  const now=Date.now();
  await pool.query("INSERT INTO telemetry(device_id,ts,metrics) VALUES ('esp32-01',$1,'{\"temperature\":25}')",[now-10000]);
  await pool.query("INSERT INTO alarms(device_id,ts,code,severity,value) VALUES ('esp32-01',$1,'OVERHEAT','high',95)",[now-10000]);
  await pool.query(readFileSync(`${root}db/migrate-c7-c8-c9.sql`,'utf8'));
  await pool.query(schema); // Idempotent full-schema setup after upgrade.
  assert.equal((await pool.query('SELECT count(*)::int n FROM telemetry')).rows[0].n,1);
  assert.equal((await pool.query('SELECT count(*)::int n FROM alarms')).rows[0].n,1);
  passed('migration preserves history and can be re-run');
  const benchSql=readFileSync(`${root}db/seed-bench.sql`,'utf8').replace(":'gateway_id'","'CCDBA7603C64'");
  await pool.query(benchSql); await pool.query(benchSql);
  const {listMachines}=await import('../src/db/machines.js');
  const {saveTelemetry}=await import('../src/db/telemetry.js');
  const {saveAlarm}=await import('../src/db/alarm.js');
  const {saveStatus}=await import('../src/db/status.js');
  const {saveDiagnostics}=await import('../src/db/diagnostics.js');
  sourcePool=(await import('../src/db/pool.js')).pool;
  assert.equal((await listMachines()).filter(m=>m.deviceId==='BENCH-01').length,1);
  passed('BENCH-01 fixture appears exactly once in dashboard registry');
  await assert.rejects(()=>saveStatus({deviceId:'GHOST',status:true}),{code:'unknown_device'});
  await assert.rejects(()=>saveDiagnostics('GHOST',{schemaVersion:1,deviceId:'GHOST',gatewayId:'CCDBA7603C64',timestamp:now,samplingIntervalMs:2000,configRequestId:'x',readings:[{key:'temperature',address:1,success:false,errorCode:2,sampledAt:now}]}), {code:'unknown_device'});
  assert.equal((await pool.query("SELECT count(*)::int n FROM machine_state WHERE device_id='GHOST'")).rows[0].n,0);
  passed('unknown status/diagnostics cannot create ghost state');
  const t={schemaVersion:1,deviceId:'BENCH-01',gatewayId:'CCDBA7603C64',messageId:'boot:1',timestamp:now,metrics:{temperature:30}};
  const results=await Promise.all(Array.from({length:8},()=>saveTelemetry(t)));
  assert.equal(results.filter(r=>r.inserted).length,1);
  await assert.rejects(()=>saveTelemetry({...t,metrics:{temperature:999}}),{code:'identity_conflict'});
  await saveTelemetry({...t,messageId:'boot:older',timestamp:now-2000,metrics:{temperature:10}});
  assert.equal((await pool.query("SELECT last_metrics FROM machine_state WHERE device_id='BENCH-01'")).rows[0].last_metrics.temperature,30);
  await saveTelemetry({...t,messageId:'boot:same-time',metrics:{temperature:31}});
  assert.equal((await pool.query("SELECT count(*)::int n FROM telemetry WHERE device_id='BENCH-01' AND ts=$1",[now])).rows[0].n,2);
  passed('concurrent duplicate is stored once; conflicting ID rejected; replay preserves latest; distinct same-time samples survive');
  const alarm={schemaVersion:1,deviceId:'BENCH-01',gatewayId:t.gatewayId,eventId:'boot:alarm1',metricKey:'temperature',timestamp:now,code:'OVERHEAT',severity:'high',value:95};
  await saveAlarm(alarm); await saveAlarm({...alarm,eventId:'boot:alarm2',severity:'critical',value:105});
  await saveAlarm({...alarm,eventId:'boot:alarm3',metricKey:'current'}); await saveAlarm(alarm);
  assert.equal((await pool.query("SELECT count(*)::int n FROM alarms WHERE device_id='BENCH-01'")).rows[0].n,3);
  await assert.rejects(()=>saveAlarm({...alarm,severity:'critical'}),{code:'identity_conflict'});
  const legacy={deviceId:'esp32-01',timestamp:now,code:'OVERHEAT',severity:'high',value:95};
  await saveAlarm(legacy); await saveAlarm({...legacy,severity:'critical',value:105}); await saveAlarm(legacy);
  assert.equal((await pool.query("SELECT count(*)::int n FROM alarms WHERE device_id='esp32-01' AND ts=$1",[now])).rows[0].n,2);
  passed('C9 distinct alarm IDs/severities/metrics survive; exact retries deduplicate including legacy payloads');
  // Fail after receipt + telemetry INSERT, before commit: neither may survive.
  await pool.query("ALTER TABLE machine_state ADD CONSTRAINT test_projection_failure CHECK ((last_metrics->>'temperature')::numeric <> 123456)");
  const rollback={...t,messageId:'boot:rollback',timestamp:now+100,metrics:{temperature:123456}};
  await assert.rejects(()=>saveTelemetry(rollback),{code:'23514'});
  assert.equal((await pool.query('SELECT count(*)::int n FROM ingestion_receipt WHERE message_id=$1',[`${t.gatewayId}:${rollback.messageId}`])).rows[0].n,0);
  assert.equal((await pool.query('SELECT count(*)::int n FROM telemetry WHERE message_id=$1',[`${t.gatewayId}:${rollback.messageId}`])).rows[0].n,0);
  await pool.query('ALTER TABLE machine_state DROP CONSTRAINT test_projection_failure');
  await saveTelemetry(rollback);
  passed('failed transaction rolls back both receipt and sample; identical retry succeeds');
  const {saveAppliedConfig}=await import('../src/db/provisioning.js');
  const cfg={deviceId:'BENCH-01',deviceName:'Commissioned simulator',protocol:'MODBUS_RTU',baudRate:9600,parity:'NONE',stopBits:1,slaveId:1,samplingIntervalMs:2000,registerMap:[{key:'temperature',address:1,functionCode:3,dataType:'INT16',scale:0.1,unit:'C'}]};
  await saveAppliedConfig(cfg,'Commissioned bench',t.gatewayId,'request-commissioned');
  await pool.query(benchSql);
  const {getCatalog}=await import('../src/db/catalog.js');
  assert.equal((await getCatalog('BENCH-01')).deviceName,'Commissioned simulator');
  assert.equal((await listMachines()).find(m=>m.deviceId==='BENCH-01').configRequestId,'request-commissioned');
  passed('real commissioning persists catalog/registry; fixture re-run preserves applied configuration');
  await sourcePool.end(); sourcePool=null;
  let worker=consumer();
  await waitFor(()=>logs.join('').includes('Da subscribe:'),'consumer subscription');
  publisher=mqtt.connect(process.env.MQTT_URL,{username:'reviewer',password,reconnectPeriod:0});
  await new Promise((resolve,reject)=>{publisher.once('connect',resolve);publisher.once('error',reject);});
  publisher.on('message',(_,buf)=>acks.push(JSON.parse(buf.toString())));
  await publisher.subscribeAsync(`legacy-link/gateways/${t.gatewayId}/ingestion/ack`,{qos:1});
  const apiLog=logs.length;
  const api=spawn(process.execPath,['src/http/server.js'],{cwd:root,env:{...process.env,HTTP_HOST:'127.0.0.1',HTTP_PORT:'0'},stdio:['ignore','pipe','pipe']});
  children.push(api);
  for(const stream of [api.stdout,api.stderr]) stream.on('data',b=>logs.push(b.toString().replaceAll(password,'[redacted]')));
  await waitFor(()=>logs.slice(apiLog).join('').includes('[HTTP] Listening port='),'HTTP listener');
  const apiPort=logs.slice(apiLog).join('').match(/Listening port=(\d+)/)[1];
  const base=`http://127.0.0.1:${apiPort}`;
  const request=(path,method='GET')=>fetch(base+path,{method});
  assert.equal((await request('/health/live')).status,200);
  await waitFor(async()=>(await request('/health/ready')).status===200,'full readiness');
  const machines=await (await request('/machines')).json();
  assert.ok(machines.some(m=>m.deviceId==='BENCH-01'));
  assert.equal((await request('/machines/BENCH-01')).status,200);
  assert.equal((await request('/machines/missing')).status,404);
  assert.equal((await request('/machines','POST')).status,405);
  assert.equal((await request('/%ZZ')).status,400);
  assert.equal((await request('/machines/BENCH-01/telemetry?limit=9999')).status,400);
  const historyPath=`/machines/BENCH-01/telemetry?from=${now-3000}&to=${now+200}&limit=1`;
  const first=await (await request(historyPath)).json();
  assert.equal(first.items.length,1); assert.ok(first.nextCursor);
  const second=await (await request(historyPath+'&cursor='+first.nextCursor)).json();
  assert.notEqual(first.items[0].id,second.items[0].id);
  const alarms=await (await request(`/machines/BENCH-01/alarms?from=${now-1}&to=${now+1}&severity=critical&acknowledged=false`)).json();
  assert.equal(alarms.items.length,1);
  const ackPath=`/alarms/${alarms.items[0].id}/ack`;
  const acknowledged=await (await request(ackPath,'POST')).json();
  assert.ok(acknowledged.acknowledgedAt);
  assert.equal((await (await request(ackPath,'POST')).json()).acknowledgedAt,acknowledged.acknowledgedAt);
  assert.equal((await request('/uptime?limit=5')).status,200);
  assert.equal((await request('/gateways')).status,200);
  // A real probe request reaches ControlService (no gateway online -> 409, not 404).
  assert.equal((await fetch(base+`/gateways/${t.gatewayId}/probe`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({config:cfg})})).status,409);
  const occupied=spawn(process.execPath,['src/http/server.js'],{cwd:root,env:{...process.env,HTTP_HOST:'127.0.0.1',HTTP_PORT:apiPort},stdio:['ignore','pipe','pipe']});
  children.push(occupied);
  let occupiedLog='';occupied.stderr.on('data',b=>{occupiedLog+=b.toString();});occupied.stdout.resume();
  await waitFor(()=>occupied.exitCode!==null,'occupied port failure');
  assert.equal(occupied.exitCode,1);assert.ok(occupiedLog.includes('EADDRINUSE'));
  passed('real HTTP entrypoint: dashboard, pagination, alarms/ACK, commands, methods, malformed URL, readiness');
  const live={...t,messageId:'boot:live',timestamp:now+1};
  await acked(live); await acked(live); // Simulate loss of the first ACK at firmware.
  assert.equal((await pool.query('SELECT count(*)::int n FROM telemetry WHERE message_id=$1',[`${t.gatewayId}:${live.messageId}`])).rows[0].n,1);
  assert.equal((await acked({...live,metrics:{temperature:99}},'telemetry','rejected')).reason,'identity_conflict');
  assert.equal((await acked({...live,deviceId:'GHOST'},'telemetry','rejected')).reason,'unknown_device');
  await acked({...alarm,eventId:'boot:mqtt-alarm'},'alarm');
  passed('real QoS0 MQTT -> SQL -> application ACK; lost ACK retry; rejected identity/unknown device; alarm ACK');
  await stop(worker);
  assert.equal((await request('/health/ready')).status,503);
  assert.equal((await request('/health/live')).status,200);
  const offline={...t,messageId:'boot:offline',timestamp:now+2};
  await send(offline); await sleep(300); // The firmware outbox keeps this sample.
  const restartLog=logs.length; worker=consumer();
  await waitFor(()=>logs.slice(restartLog).join('').includes('Da subscribe:'),'consumer restart');
  await acked(offline); // Firmware replays the identical sample after recovery.
  passed('backend restart + simulated firmware outbox replay recovers sample');
  docker('stop','-t','1',pgName);
  assert.equal((await request('/health/ready')).status,503);
  assert.equal((await request('/health/live')).status,200);
  const failed={...t,messageId:'boot:db-offline',timestamp:now+3};
  const before=acks.length, logStart=logs.length;
  await send(failed);
  await waitFor(()=>logs.slice(logStart).join('').includes('[INGESTION] telemetry BENCH-01:'),'DB failure log');
  assert.equal(acks.slice(before).some(a=>a.messageId===failed.messageId),false);
  assert.equal(worker.exitCode,null);
  docker('start',pgName);
  await waitFor(async()=>{try{await pool.query('SELECT 1');return true;}catch{return false;}},'DB restart');
  await acked(failed);
  assert.equal((await pool.query('SELECT count(*)::int n FROM telemetry WHERE message_id=$1',[`${t.gatewayId}:${failed.messageId}`])).rows[0].n,1);
  passed('DB outage sends no success ACK; retry after recovery commits once');
  docker('stop','-t','1',mqName);
  await waitFor(async()=>(await request('/health/ready')).status===503,'broker outage readiness');
  assert.equal((await request('/health/live')).status,200);
  passed('C10 occupied port fails cleanly; broker outage changes readiness without killing HTTP');
} catch(error) {
  console.error(error.message.replaceAll(password,'[redacted]'));
  console.error(logs.slice(-12).join(''));
  process.exitCode=1;
} finally {
  if(publisher) await publisher.endAsync(true);
  for(const child of children) await stop(child);
  if(sourcePool) await sourcePool.end();
  if(pool) await pool.end();
  for(const name of containers.reverse()) { try{docker('rm','-f','-v',name);}catch{} }
}

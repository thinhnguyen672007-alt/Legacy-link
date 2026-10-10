// C15: thử TLS + ACL trên broker Docker riêng, không sửa broker demo đang chạy.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import mqtt from 'mqtt';
const dir=mkdtempSync(join(tmpdir(),'legacy-security-')), name=`legacy-acl-${randomUUID().slice(0,8)}`;
const password=randomUUID(), clients=[];
let created=false;
function command(program,args) {
  const p=spawnSync(program,args,{encoding:'utf8',timeout:30000});
  if(p.status!==0) throw new Error(`${program}: ${p.stderr.replaceAll(password,'[redacted]')}`);
  return p.stdout.trim();
}
const docker=(...args)=>command('docker',args);
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function connect(url,username,ca) {
  const client=mqtt.connect(url,{username,password,ca,reconnectPeriod:0,connectTimeout:3000,protocolVersion:5});
  clients.push(client);
  await new Promise((resolve,reject)=>{client.once('connect',resolve);client.once('error',reject);});
  return client;
}
try {
  command('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',join(dir,'server.key'),'-out',join(dir,'server.crt'),'-days','1','-subj','/CN=localhost','-addext','subjectAltName=IP:127.0.0.1,DNS:localhost']);
  writeFileSync(join(dir,'acl'),readFileSync(new URL('../deploy/acl',import.meta.url),'utf8')+'\nuser second-gateway\ntopic write legacy-link/devices/OTHER/telemetry\n');
  const template=readFileSync(new URL('../deploy/mosquitto.conf',import.meta.url),'utf8');
  writeFileSync(join(dir,'mosquitto.conf'),template.replaceAll('/mosquitto/secrets/','/tmp/secure/').replace('/mosquitto/config/acl','/tmp/secure/acl').replace('persistence true','persistence false'));
  docker('create','--name',name,'-e',`TEST_PASSWORD=${password}`,'-p','127.0.0.1::8883','--entrypoint','sh','eclipse-mosquitto:2','-c',
    'mosquitto_passwd -b -c /tmp/secure/passwords backend "$TEST_PASSWORD"; mosquitto_passwd -b /tmp/secure/passwords gateway-643C60A7DBCC "$TEST_PASSWORD"; mosquitto_passwd -b /tmp/secure/passwords second-gateway "$TEST_PASSWORD"; chown -R mosquitto:mosquitto /tmp/secure; exec mosquitto -c /tmp/secure/mosquitto.conf');
  created=true;
  docker('cp',dir,`${name}:/tmp/secure`);
  docker('start',name);
  const port=docker('port',name,'8883/tcp').split(':').at(-1), url=`mqtts://127.0.0.1:${port}`;
  const ca=readFileSync(join(dir,'server.crt'));
  let backend;
  for(let i=0;i<30;i++) {
    try { backend=await connect(url,'backend',ca); break; } catch { await sleep(100); }
  }
  assert.ok(backend,'Broker TLS must start');
  await assert.rejects(()=>connect(url,'backend',undefined)); // Không tin CA thì TLS phải chặn.
  const device=await connect(url,'gateway-643C60A7DBCC',ca), messages=[];
  backend.on('message',(topic,raw)=>messages.push({topic,body:raw.toString()}));
  await backend.subscribeAsync('legacy-link/devices/+/telemetry',{qos:1});
  await device.publishAsync('legacy-link/devices/BENCH-01/telemetry','allowed',{qos:1});
  for(let i=0;i<30&&!messages.length;i++) await sleep(50);
  assert.equal(messages[0]?.body,'allowed');
  // MQTT 5 báo lỗi quyền bằng reason code; vẫn kiểm tra phía nhận không thấy bản tin.
  await device.publishAsync('legacy-link/devices/OTHER/telemetry','forbidden',{qos:1}).catch(()=>{});
  await device.publishAsync('legacy-link/gateways/OTHER/config','forbidden',{qos:1}).catch(()=>{});
  const got=[]; device.on('message',(topic,raw)=>got.push({topic,body:raw.toString()}));
  await device.subscribeAsync(['legacy-link/gateways/643C60A7DBCC/ingestion/ack','legacy-link/devices/OTHER/telemetry'],{qos:1}).catch(()=>{});
  // Backend không được publish telemetry; dùng gateway BENCH để kiểm tra chéo quyền đọc bằng topic gateway khác.
  await backend.publishAsync('legacy-link/gateways/643C60A7DBCC/ingestion/ack','ack',{qos:1});
  await sleep(250);
  assert.equal(messages.length,1);
  const second=await connect(url,'second-gateway',ca);
  await second.publishAsync('legacy-link/devices/OTHER/telemetry','private-other',{qos:1});
  for(let i=0;i<30&&messages.length<2;i++) await sleep(50);
  assert.equal(messages.length,2);
  await sleep(150);
  assert.ok(!got.some(m=>m.body==='private-other')); // Đã publish thật nhưng gateway BENCH không được đọc.
  assert.ok(got.some(m=>m.body==='ack'));
  assert.ok(!got.some(m=>m.body==='forbidden'));
  console.log('PASS C15 TLS trusted CA required, gateway own telemetry allowed, cross-device publish denied, application ACK allowed');
} finally {
  await Promise.all(clients.map(client=>client.endAsync(true)));
  if(created) docker('rm','-f',name);
  rmSync(dir,{recursive:true,force:true});
}

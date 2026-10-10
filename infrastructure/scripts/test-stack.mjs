// Dựng cả stack từ bản mã đang sửa, trên volume/network/cổng riêng; không dùng .env thật.
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:net';
import assert from 'node:assert/strict';
const repo = fileURLToPath(new URL('../../', import.meta.url));
const workspace = mkdtempSync(join(tmpdir(), 'legacy-stack-'));
const cwd = join(workspace, 'infrastructure');
const id = 'accept-' + randomBytes(5).toString('hex');
const secret = () => randomBytes(32).toString('hex');
const env = { ...process.env, GEMINI_API_KEY:'', COMPOSE_PROJECT_NAME:id, COMPOSE_PROFILES:'full' };
// Git xác định file nguồn, loại file ignored (.env, pgdata, passwd, node_modules).
const files = execFileSync('git', ['ls-files','--cached','--others','--exclude-standard','-z','--','backend','frontend','infrastructure'], {cwd:repo,encoding:'utf8'}).split('\0').filter(Boolean);
for(const file of files) { const target=join(workspace,file); mkdirSync(dirname(target),{recursive:true}); copyFileSync(join(repo,file),target); }
async function freePort() {
  const server=createServer(); await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const port=server.address().port; await new Promise(resolve=>server.close(resolve)); return port;
}
const frontendPort=await freePort();
const settings = { COMPOSE_PROFILES:'full',MQTT_PORT:await freePort(),MQTT_BIND_ADDRESS:'127.0.0.1',POSTGRES_PORT:await freePort(),HTTP_PORT:await freePort(),FRONTEND_PORT:frontendPort,FRONTEND_BIND_ADDRESS:'127.0.0.1',
  HTTP_BIND_ADDRESS:'127.0.0.1',MQTT_CONTAINER_NAME:id+'-mqtt',POSTGRES_CONTAINER_NAME:id+'-pg',
  CONSUMER_CONTAINER_NAME:id+'-consumer',API_CONTAINER_NAME:id+'-api',DOCKER_NETWORK_NAME:id+'-net',
  POSTGRES_USER:'acceptance',POSTGRES_PASS:secret(),POSTGRES_DB:'acceptance',MQTT_DEV_USER:'acceptance',MQTT_DEV_PASS:secret(),
  MQTT_CLIENT_ID:id,API_READ_TOKEN:secret(),API_WRITE_TOKEN:secret(),ADMIN_USERNAME:'admin',ADMIN_PASSWORD:secret(),
  CORS_ORIGINS:`http://localhost:5173,http://localhost:${frontendPort},http://127.0.0.1:${frontendPort}`,MQTT_QOS:1 };
writeFileSync(join(cwd,'.env'),Object.entries(settings).map(([k,v])=>`${k}=${v}`).join('\n')+'\n',{mode:0o600});
function run(command,args,overrides={}) {return new Promise((resolve,reject)=>{
  const child=spawn(command,args,{cwd,env:{...env,...overrides},stdio:'inherit'});
  child.on('error',reject); child.on('exit',code=>code===0?resolve():reject(new Error(`${command} ${args[0]} failed (${code})`)));
});}
console.log('ISOLATED STACK:',workspace);
let started=false;
try {
  // Đọc cấu hình trước; lỗi Compose phải lộ ra trước khi tạo container.
  await run('docker',['compose','config','--quiet']);
  started=true;
  await run('docker',['compose','up','-d','--build','--wait','--wait-timeout','180']);
  await run('bash',['scripts/status.sh']);
  const url=`http://127.0.0.1:${settings.HTTP_PORT}`;
  const request=(path,token,options={})=>fetch(url+path,{...options,headers:{...options.headers,...(token?{Authorization:`Bearer ${token}`}:{})},signal:AbortSignal.timeout(5000)});
  const web=`http://127.0.0.1:${settings.FRONTEND_PORT}`;
  const webRequest=(path,token,options={})=>fetch(web+path,{...options,headers:{...options.headers,Origin:web,...(token?{Authorization:`Bearer ${token}`}:{})},signal:AbortSignal.timeout(5000)});
  assert.equal((await webRequest('/health')).status,200);
  assert.equal((await webRequest('/api/health/ready')).status,200);
  const login=async(password)=>webRequest('/api/auth/login','',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'admin',password})});
  const firstLogin=await login(settings.ADMIN_PASSWORD);
  assert.equal(firstLogin.status,200);
  const firstToken=(await firstLogin.json()).token;
  const adminBefore=await (await webRequest('/api/auth/me',firstToken)).json();
  assert.equal(adminBefore.role,'admin');
  const nextPassword=secret();
  assert.equal((await webRequest('/api/auth/password',firstToken,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({currentPassword:settings.ADMIN_PASSWORD,password:nextPassword})})).status,200);
  assert.equal((await login(settings.ADMIN_PASSWORD)).status,401);
  console.log('PASS fresh docker compose up builds frontend, migrates schema and bootstraps admin');
  assert.equal((await request('/machines')).status,401);
  assert.equal((await request('/machines',settings.API_READ_TOKEN)).status,200);
  assert.equal((await request('/alarms/1/ack',settings.API_READ_TOKEN,{method:'POST'})).status,403);
  const allowed=await request('/machines',settings.API_READ_TOKEN,{headers:{Origin:'http://localhost:5173'}});
  assert.equal(allowed.status,200); assert.equal(allowed.headers.get('access-control-allow-origin'),'http://localhost:5173');
  assert.equal((await request('/machines',settings.API_READ_TOKEN,{headers:{Origin:'http://untrusted.invalid'}})).status,403);
  console.log('PASS real infra proxy forwards read token, blocks read-token writes, enforces CORS');
  await run('docker',['compose','run','--rm','-T','--no-deps','--entrypoint','node','backend-api','scripts/migrate.mjs']);
  console.log('PASS migration rerun on existing schema');
  // Có dữ liệu cũ thật trong fixture để phép kiểm bảo toàn lịch sử không chỉ so hai tập rỗng.
  const baselineSql = "INSERT INTO device(device_id,machine_type,name) VALUES('ACCEPT-BASE','TEST','Existing fixture'); INSERT INTO telemetry(device_id,ts,metrics) VALUES('ACCEPT-BASE',1700000000000,'{\"temperature\":30}'); INSERT INTO alarms(device_id,ts,code,severity,value) VALUES('ACCEPT-BASE',1700000000000,'OVERHEAT','high',95);";
  await run('docker',['compose','exec','-T','postgres','sh','-c','exec psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "$1"','sh',baselineSql]);
  await run('docker',['compose','down']);
  await run('docker',['compose','up','-d','--wait','--wait-timeout','180']);
  const afterRestart=await login(nextPassword);
  assert.equal(afterRestart.status,200);
  const adminAfter=await (await webRequest('/api/auth/me',(await afterRestart.json()).token)).json();
  assert.equal(adminAfter.id,adminBefore.id);
  assert.equal((await login(settings.ADMIN_PASSWORD)).status,401);
  const retained=await (await request('/machines/ACCEPT-BASE/telemetry?from=1699999999999&to=1700000000001',settings.API_READ_TOKEN)).json();
  assert.equal(retained.items.length,1);
  console.log('PASS restart keeps admin identity, changed password and database rows');
  // Project khác không được tiếp quản container cùng tên. Lần thử này phải dừng trước khi ngắt API.
  await assert.rejects(run('bash',['scripts/setup.sh'],{COMPOSE_PROJECT_NAME:id+'-foreign'}));
  assert.equal((await request('/health/ready')).status,200);
  await run('bash',['scripts/setup.sh']);
  assert.equal((await request('/health/ready')).status,200);
  console.log('PASS setup rerun on owned containers; foreign project takeover blocked');
  // Bốn fault chỉ tác động project tạm. Bao gồm retry, chống trùng, API và dữ liệu cũ.
  await run('bash',['scripts/test-recovery.sh']);
  await run('bash',['scripts/backup-db.sh','backups/acceptance.dump']);
  await run('bash',['scripts/verify-backup.sh','backups/acceptance.dump']);
  await run('docker',['compose','build','retention']);
  await run('docker',['compose','run','--rm','-T','--no-deps','-e','RETENTION_ONCE=true','retention']);
  await run('docker',['compose','run','--rm','-T','--no-deps','-e','BACKUP_ONCE=true','backup']);
  writeFileSync(join(workspace,'result.json'),JSON.stringify({passed:true,at:new Date().toISOString(),scope:'cold compose/frontend/admin, restart, proxy/auth/CORS/migration/outages/backup-restore; no physical ESP32'},null,2));
  console.log('PASS full stack acceptance. Evidence:',workspace);
} catch (error) {
  await run('docker',['compose','logs','--no-color','--tail','60']).catch(()=>{});
  throw error;
} finally {
  // Chỉ xóa container/volume thuộc project ngẫu nhiên do bài test này tạo.
  if(started) await run('docker',['compose','down','--volumes','--remove-orphans']);
}

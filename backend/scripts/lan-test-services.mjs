// Điều khiển hai process Node cho buổi test LAN; PID/log ở thư mục Git bỏ qua.
// Chỉ dừng đúng process do script này tạo, không dùng pkill làm ảnh hưởng chương trình khác.
import {spawn} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync,openSync,closeSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';

const root=fileURLToPath(new URL('../',import.meta.url));
const runtime=join(root,'.env.test-runtime');
const stateFile=join(runtime,'services.json');
const entries={api:'src/http/server.js',consumer:'src/index.js'};
const [action='status',target='all']=process.argv.slice(2);
if(!['start','stop','restart','status'].includes(action)||!['all','api','consumer'].includes(target)) {
 console.error('Dùng: node scripts/lan-test-services.mjs start|stop|restart|status [all|api|consumer]');process.exit(1);
}
mkdirSync(runtime,{recursive:true,mode:0o700});
let state={};try{state=JSON.parse(readFileSync(stateFile,'utf8'));}catch{}
const selected=target==='all'?['consumer','api']:[target];
function save(){writeFileSync(stateFile,JSON.stringify(state,null,2)+'\n',{mode:0o600});}
function owned(name) {
 const info=state[name];if(!info?.pid)return false;
 try {
  process.kill(info.pid,0);
  const args=readFileSync(`/proc/${info.pid}/cmdline`,'utf8').split('\0');
  return args.includes(join(root,entries[name]));
 }catch{return false;}
}
async function stop(name) {
 if(!owned(name)){delete state[name];save();return;}
 process.kill(state[name].pid,'SIGTERM');
 // Consumer cần tối đa 15s drain theo cấu hình mặc định; chờ tối đa 25s.
 for(let i=0;i<250&&owned(name);i++)await delay(100);
 if(owned(name))throw new Error(`${name} chưa dừng; xem log, không tự SIGKILL.`);
 delete state[name];save();console.log(`${name}: đã dừng`);
}
async function start(name) {
 if(owned(name)){console.log(`${name}: đang chạy PID ${state[name].pid}`);return;}
 process.loadEnvFile(join(root,'.env'));
 const log=join(runtime,`${name}.log`),fd=openSync(log,'a',0o600);
 const child=spawn(process.execPath,[join(root,entries[name])],{
  cwd:root,detached:true,stdio:['ignore',fd,fd],
  env:{...process.env,HTTP_HOST:'0.0.0.0',API_AUTH_DISABLED:'false'},
 });
 try {await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject);});}
 finally{closeSync(fd);}
 child.unref();state[name]={pid:child.pid,log,startedAt:new Date().toISOString()};save();
 await delay(1000);
 if(!owned(name)){delete state[name];save();throw new Error(`${name} không khởi động được; xem ${log}`);}
 console.log(`${name}: đã bật PID ${child.pid}; log ${log}`);
}
try {
 if(action==='stop'||action==='restart')for(const name of [...selected].reverse())await stop(name);
 if(action==='start'||action==='restart')for(const name of selected)await start(name);
 console.log(JSON.stringify(Object.fromEntries(selected.map(name=>[name,{running:owned(name),...(owned(name)?state[name]:{})}])),null,2));
}catch(error){console.error(error.message);process.exitCode=1;}

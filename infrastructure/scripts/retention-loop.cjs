// Lịch dọn dữ liệu có giới hạn: mặc định dry-run, bật RETENTION_APPLY mới xóa.
const { spawn } = require('node:child_process');
const period = Number(process.env.RETENTION_INTERVAL_SECONDS || 3600);
if (!Number.isInteger(period) || period < 60 || period > 86400) throw new Error('Invalid retention interval');
let child, timer, stopping = false;
function run() {
  const args=['scripts/retention.mjs', ...(process.env.RETENTION_APPLY === 'true' ? ['--apply'] : [])];
  child=spawn(process.execPath,args,{stdio:'inherit',env:process.env});
  child.once('error',()=>process.exit(1));
  child.once('exit',code=>{
    child=null;
    if (code !== 0) process.exit(code || 1);
    if(stopping || process.env.RETENTION_ONCE === 'true') process.exit(0);
    timer=setTimeout(run,period*1000); // Không chồng hai lần chạy khi DB chậm.
  });
}
for(const signal of ['SIGINT','SIGTERM']) process.on(signal,()=>{
  stopping=true; clearTimeout(timer);
  if(child) child.kill(signal); else process.exit(0);
});
run();

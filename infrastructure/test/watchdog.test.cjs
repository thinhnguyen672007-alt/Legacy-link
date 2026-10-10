// Dùng watchdog thật với worker giả cần 8 giây để dọn: bản cũ giết ở giây thứ 7.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync}=require('node:fs');
const {tmpdir}=require('node:os');
const {join,resolve}=require('node:path');
const {spawn}=require('node:child_process');
test('watchdog chờ worker drain lâu hơn 7 giây', {timeout:20000}, async()=>{
  const work=mkdtempSync(join(tmpdir(),'legacy-watchdog-'));
  mkdirSync(join(work,'src/http'),{recursive:true});
  writeFileSync(join(work,'src/http/server.js'),`
    const fs=require('node:fs');
    const timer=setInterval(()=>{},1000);
    process.on('SIGTERM',()=>setTimeout(()=>{fs.writeFileSync('drained','yes');clearInterval(timer);process.exit(0)},8000));
    console.log('worker-ready');
  `);
  const child=spawn(process.execPath,[resolve(__dirname,'../scripts/run-backend.cjs'),'api'],{
    cwd:work,env:{...process.env,SHUTDOWN_TIMEOUT_MS:'9000'},stdio:['ignore','pipe','pipe']});
  const exited=new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',code=>resolve(code));});
  try {
    await new Promise((resolve,reject)=>{child.stdout.once('data',resolve);child.once('error',reject);child.once('exit',()=>reject(new Error('Wrapper ended before ready')));});
    child.kill('SIGTERM');
    assert.equal(await exited,0);
    assert.equal(readFileSync(join(work,'drained'),'utf8'),'yes');
  } finally { if(child.exitCode===null) child.kill('SIGTERM'); rmSync(work,{recursive:true,force:true}); }
});

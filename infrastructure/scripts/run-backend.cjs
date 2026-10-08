// Infra watchdog: Docker restart policies only act when the process exits.
// Allow transient outages; recycle Node after sustained readiness failure.
const { spawn } = require('node:child_process');
const mode = process.argv[2];
if (!['consumer', 'api'].includes(mode)) throw new Error('Expected consumer or api');
const child = spawn(process.execPath, [mode === 'api' ? 'src/http/server.js' : 'src/index.js'], { stdio: 'inherit' });
let stopping = false, unhealthy = 0, interval, grace, force, probe;
function stop(code) {
  if (stopping) return;
  stopping = true;
  clearTimeout(grace); clearInterval(interval);
  if (probe) probe.kill('SIGTERM');
  child.once('exit', () => process.exit(code));
  child.kill('SIGTERM');
  force = setTimeout(() => { child.kill('SIGKILL'); process.exit(code); }, 7000);
}
child.on('error', () => { console.error('[INFRA] Cannot start backend'); process.exit(1); });
child.on('exit', code => {
  if (!stopping) { clearTimeout(grace); clearInterval(interval); process.exit(code ?? 1); }
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => stop(0));
async function check() {
  if (stopping || probe) return;
  let ok = false;
  if (mode === 'api') {
    try { ok = (await fetch('http://127.0.0.1:3000/health/ready', { signal: AbortSignal.timeout(4000) })).ok; } catch {}
  } else {
    ok = await new Promise(resolve => {
      probe = spawn(process.execPath, ['/app/infra-check.cjs'], { stdio: 'ignore' });
      probe.once('error', () => { probe = null; resolve(false); });
      probe.once('exit', code => { probe = null; resolve(code === 0); });
    });
  }
  if (stopping) return;
  unhealthy = ok ? 0 : unhealthy + 1;
  if (unhealthy >= 3) {
    console.error('[INFRA] Readiness failed three times; exiting for Docker to restart');
    stop(1);
  }
}
grace = setTimeout(() => { void check(); interval = setInterval(() => void check(), 5000); }, 15000);

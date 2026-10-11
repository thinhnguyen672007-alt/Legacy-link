// Launch the native packaged app on the runner; no server or credentials needed.
const {spawn} = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'legacy-link-smoke-'));
const child = spawn(process.argv[2], [`--user-data-dir=${directory}`], {stdio: 'inherit'});
let stopping = false;
child.on('error', error => {console.error(error); process.exitCode = 1;});
child.on('exit', (code, signal) => {
  if (!stopping) {console.error(`App exited before startup check: ${code}/${signal}`); process.exitCode = 1;}
  fs.rmSync(directory, {recursive: true, force: true});
});
const timer = setTimeout(() => {
  if (child.exitCode !== null || child.signalCode !== null) return;
  stopping = true;
  console.log('Packaged app remained running through startup.');
  child.kill('SIGTERM');
}, 10000);
child.on('exit', () => clearTimeout(timer));

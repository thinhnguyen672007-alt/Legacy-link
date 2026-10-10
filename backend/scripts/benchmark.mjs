// Benchmark chỉ trên stack Docker cô lập do integration tạo, không dùng DB demo.
import { spawn } from 'node:child_process';
const samples = Number(process.env.BENCHMARK_SAMPLES ?? 200);
if (!Number.isInteger(samples) || samples < 20 || samples > 10000)
  throw new Error('BENCHMARK_SAMPLES phải 20..10000');
const child = spawn(process.execPath, ['scripts/ingestion-integration.mjs'], {
  stdio: 'inherit',
  env: { ...process.env, BENCHMARK_SAMPLES: String(samples) },
});
child.on('exit', (code) => {
  process.exitCode = code ?? 1;
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));

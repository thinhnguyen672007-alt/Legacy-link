// Watchdog là tiến trình giám sát Node: Docker tự restart khi tiến trình thoát,
// nhưng chỉ đánh dấu unhealthy khi health check lỗi. Vì vậy cần chủ động thoát
// sau nhiều lần readiness lỗi liên tục để restart policy có thể phục hồi dịch vụ.
// Đây là lớp vận hành trong infra; lỗi reconnect của backend vẫn cần sửa ở nguồn.
const { spawn } = require('node:child_process');
const mode = process.argv[2];
if (!['consumer', 'api'].includes(mode)) throw new Error('Expected consumer or api');
// Chạy entrypoint backend gốc như tiến trình con; log vẫn đi thẳng vào docker compose logs.
// Cùng một wrapper phục vụ consumer hoặc API, không chép/sửa mã nghiệp vụ backend.
const child = spawn(process.execPath, [mode === 'api' ? 'src/http/server.js' : 'src/index.js'], { stdio: 'inherit' });
let stopping = false, unhealthy = 0, interval, grace, force, probe;
// Khi dừng, ngừng kiểm tra mới rồi gửi SIGTERM cho Node đóng MQTT/DB sạch.
// Nếu quá 7 giây vẫn chưa thoát thì buộc dừng, tránh container treo mãi.
// stopping ngăn hai yêu cầu dừng tạo hai vòng cleanup chồng nhau.
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
// Nếu Node tự chết, wrapper cũng thoát để Docker nhận ra lỗi; không giữ container Up giả.
child.on('exit', code => {
  if (!stopping) { clearTimeout(grace); clearInterval(interval); process.exit(code ?? 1); }
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => stop(0));
// API dùng /health/ready; consumer dùng probe schema + heartbeat riêng.
// Không dùng /health/live vì tiến trình còn trả lời chưa chứng minh DB/MQTT sẵn sàng.
// probe đang chạy thì không tạo thêm probe consumer, tránh dồn kết nối DB.
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
  // Một lần kiểm tra tốt xóa chuỗi lỗi cũ. Chỉ ba lần lỗi liên tục mới kích hoạt restart,
  // giảm việc khởi động lại do một lỗi mạng thoáng qua.
  unhealthy = ok ? 0 : unhealthy + 1;
  if (unhealthy >= 3) {
    console.error('[INFRA] Readiness failed three times; exiting for Docker to restart');
    stop(1);
  }
}
// Chờ 15 giây cho Node khởi động, sau đó kiểm tra mỗi 5 giây.
// Đây là lịch kiểm tra, không phải cam kết dịch vụ luôn phục hồi trong đúng 15 giây.
grace = setTimeout(() => { void check(); interval = setInterval(() => void check(), 5000); }, 15000);

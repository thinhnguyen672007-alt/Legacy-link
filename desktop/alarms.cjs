const DAY = 86400000;
function normalizeServer(input) {
  const u = new URL(String(input).trim());
  if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password || u.search || u.hash || u.pathname !== '/') throw new Error('Nhập URL web HTTP/HTTPS, chỉ gồm địa chỉ máy chủ và cổng.');
  return u.origin;
}
function validatePage(p, from, to) {
  if (!p || !Array.isArray(p.items) || p.items.length > 500 || !(p.nextCursor === null || typeof p.nextCursor === 'string' && /^[\w-]{1,160}$/.test(p.nextCursor))) throw new Error('Dữ liệu cảnh báo không hợp lệ');
  for (const a of p.items) {
    if (!a || typeof a.id !== 'string' || !/^[1-9]\d{0,18}$/.test(a.id) || typeof a.deviceId !== 'string' || !/^[\w-]{1,31}$/.test(a.deviceId) || !Number.isSafeInteger(a.timestamp) || a.timestamp < from || a.timestamp > to || !['low','medium','high','critical'].includes(a.severity) || typeof a.code !== 'string' || a.code.length > 100 || a.value != null && !Number.isFinite(a.value)) throw new Error('Dữ liệu cảnh báo không hợp lệ');
  }
  return p;
}
class AlarmPoller {
  constructor({fetchPage, notify, status, interval = 5000, now = Date.now}) {
    Object.assign(this, {fetchPage, notify, status, interval, now});
    this.generation = 0; this.token = ''; this.seen = new Map(); this.baseline = false;
  }
  stop() {
    this.generation++; clearTimeout(this.timer); this.controller?.abort();
    this.token = ''; this.seen.clear(); this.baseline = false;
  }
  start(token) {
    if (token === this.token) return;
    this.stop(); this.token = token; this.failures = 0;
    if (token) void this.tick(this.generation);
    else this.status('Cần đăng nhập');
  }
  async tick(generation) {
    if (generation !== this.generation || !this.token) return;
    this.controller = new AbortController();
    const to = this.now(), from = Math.max(0, to - DAY), found = new Map(), cursors = new Set();
    let cursor, delay = this.interval;
    try {
      do {
        if (cursors.size >= 100 || found.size > 50000) throw new Error('Theo dõi chậm: quá nhiều cảnh báo');
        const p = validatePage(await this.fetchPage({from, to, cursor, token: this.token, signal: this.controller.signal}), from, to);
        if (generation !== this.generation) return;
        for (const a of p.items) found.set(a.id, a);
        cursor = p.nextCursor;
        if (cursor && cursors.has(cursor)) throw new Error('Cursor cảnh báo bị lặp');
        if (cursor) cursors.add(cursor);
      } while (cursor);
      const fresh = this.baseline ? [...found.values()].filter(a => !this.seen.has(a.id)) : [];
      for (const [id, ts] of this.seen) if (ts < from) this.seen.delete(id);
      for (const a of found.values()) this.seen.set(a.id, a.timestamp);
      this.baseline = true; this.failures = 0;
      this.status('Đang theo dõi');
      if (fresh.length) this.notify(fresh, generation);
    } catch (e) {
      if (generation !== this.generation) return;
      if (e.status === 401 || e.status === 403) {
        const token = this.token; this.stop(); this.status(e.status === 401 ? 'Cần đăng nhập' : 'Không có quyền theo dõi', e.status === 401 ? token : undefined); return;
      }
      delay = Math.max(Math.min(60000, this.interval * 2 ** this.failures++), Math.min(300000, e.retryAfter || 0));
      this.status(e.message?.includes('Theo dõi chậm') ? e.message : 'Mất kết nối · đang thử lại');
    }
    if (generation === this.generation && this.token) this.timer = setTimeout(() => void this.tick(generation), delay);
  }
}
module.exports = {AlarmPoller, normalizeServer, validatePage};

import { useRef, useState, type FormEvent } from "react";
import { ArrowRight, ShieldCheck, Unplug } from "lucide-react";
import { normalizeUrl } from "../api/client";
import { useSession } from "../session";
import { Notice } from "../components/ui";
import { login } from "../api/accounts";
export function Connection() {
  const { connect, sessionError } = useSession();
  const pending = useRef(false);
  const [base, setBase] = useState(
    import.meta.env.VITE_API_BASE_URL ||
      (import.meta.env.PROD
        ? `${location.origin}/api`
        : "http://localhost:3000"),
  );
  const [read, setRead] = useState("");
  const [write, setWrite] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (pending.current) return;
    pending.current = true;
    setError("");
    setBusy(true);
    try {
      const url = normalizeUrl(base);
      const result = await login(url, read.trim(), write);
      const s = {
        base: url,
        readToken: result.token,
        writeToken: result.user.role === "viewer" ? "" : result.token,
        user: result.user,
      };
      connect(s);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không thể kết nối.");
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <div className="connection">
      <div className="connection-intro">
        <div className="brand">
          <span className="brand-mark">
            <Unplug size={24} />
          </span>
          LEGACY<span>LINK</span>
        </div>
        <h1>
          Hiểu rõ thiết bị.
          <br />
          Chủ động vận hành.
        </h1>
        <p>Theo dõi số đo, xem cảnh báo và cấu hình gateway từ một nơi.</p>
        <div className="connection-proof">
          <ShieldCheck size={22} />
          <span>
            Kết nối trực tiếp API của đội.
            <br />
            Mỗi nhân viên có tài khoản và quyền riêng.
          </span>
        </div>
        <small>
          Dự án Legacy-link · DENSO Factory Hacks 2026
          <br />
          Không phải phần mềm chính thức của DENSO.
        </small>
      </div>
      <div className="connection-form">
        <form onSubmit={submit}>
          <h2>Đăng nhập</h2>
          <p>Mở giao diện trên máy backend để dùng địa chỉ mặc định.</p>
          <label>
            Địa chỉ API
            <input
              disabled={busy}
              type="url"
              required
              value={base}
              onChange={(e) => setBase(e.target.value)}
              placeholder="http://localhost:3000"
              autoComplete="url"
            />
          </label>
          <label>
            Tên đăng nhập
            <input
              disabled={busy}
              type="text"
              required
              value={read}
              onChange={(e) => setRead(e.target.value)}
              autoComplete="username"
              spellCheck={false}
            />
          </label>
          <label>
            Mật khẩu
            <input
              disabled={busy}
              type="password"
              required
              value={write}
              onChange={(e) => setWrite(e.target.value)}
              autoComplete="current-password"
              spellCheck={false}
            />
          </label>
          <p className="help">Liên hệ quản trị viên để được cấp tài khoản.</p>
          {(error || sessionError) && (
            <Notice tone="bad">{error || sessionError}</Notice>
          )}
          <button className="primary wide" disabled={busy}>
            {busy ? "Đang kiểm tra…" : "Đăng nhập"}
            <ArrowRight size={18} />
          </button>
          <details>
            <summary>Không kết nối được?</summary>
            <p>
              API Docker Compose cần hoạt động; origin{" "}
              <code>{location.origin}</code> phải có trong CORS_ORIGINS. Nếu mở
              từ máy khác, localhost là máy đang dùng, hãy nhập IP máy backend.
              Trang HTTPS không gọi được API HTTP.
            </p>
          </details>
        </form>
      </div>
    </div>
  );
}

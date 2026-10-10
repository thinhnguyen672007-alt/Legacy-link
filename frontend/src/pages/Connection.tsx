import { LanguageToggle } from "../components/LanguageToggle";
import { tr } from "../language";
import { useRef, useState, type FormEvent } from "react";
import { ArrowRight, ShieldCheck, Unplug } from "lucide-react";
import { normalizeUrl } from "../api/client";
import { useSession } from "../session";
import { Notice } from "../components/ui";
import { login } from "../api/accounts";
export function Connection() {
  const { connect, sessionError } = useSession();
  const pending = useRef(false);
  const base =
    import.meta.env.VITE_API_BASE_URL ||
    (import.meta.env.PROD ? `${location.origin}/api` : "http://localhost:3000");
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
          {tr("Hiểu rõ thiết bị.")}
          <br />
          {tr("Chủ động vận hành.")}
        </h1>
        <p>
          {tr("Theo dõi số đo, xem cảnh báo và cấu hình gateway từ một nơi.")}
        </p>
        <div className="connection-proof">
          <ShieldCheck size={22} />
          <span>
            {tr("Theo dõi thiết bị của đội.")}
            <br />
            {tr("Mỗi nhân viên có tài khoản và quyền riêng.")}
          </span>
        </div>
        <small>
          {tr("Dự án Legacy-link · DENSO Factory Hacks 2026")}
          <br />
          {tr("Không phải phần mềm chính thức của DENSO.")}
        </small>
      </div>
      <div className="connection-form">
        <form onSubmit={submit}>
          <div className="connection-language">
            <LanguageToggle />
          </div>
          <h2>{tr("Đăng nhập")}</h2>
          <p>{tr("Đăng nhập để theo dõi thiết bị và cảnh báo.")}</p>
          <label>
            {tr("Tên đăng nhập")}
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
            {tr("Mật khẩu")}
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
          <p className="help">
            {tr("Liên hệ quản trị viên để được cấp tài khoản.")}
          </p>
          {(error || sessionError) && (
            <Notice tone="bad">{tr(error || sessionError || "")}</Notice>
          )}
          <button className="primary wide" disabled={busy}>
            {busy ? tr("Đang kiểm tra…") : tr("Đăng nhập")}
            <ArrowRight size={18} />
          </button>
          <details>
            <summary>{tr("Không kết nối được?")}</summary>
            <p>
              {tr(
                "Kiểm tra kết nối mạng rồi thử lại. Nếu vẫn không đăng nhập được, hãy liên hệ quản trị viên.",
              )}
            </p>
          </details>
        </form>
      </div>
    </div>
  );
}

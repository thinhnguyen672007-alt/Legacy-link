import { useState, type FormEvent } from "react";
import { ArrowRight, ShieldCheck, Unplug } from "lucide-react";
import { createApi, normalizeUrl } from "../api/client";
import { useSession } from "../session";
import { Notice } from "../components/ui";
export function Connection() {
  const { connect } = useSession();
  const [base, setBase] = useState(
    import.meta.env.VITE_API_BASE_URL || "http://localhost:3000",
  );
  const [read, setRead] = useState("");
  const [write, setWrite] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const s = {
        base: normalizeUrl(base),
        readToken: read.trim(),
        writeToken: write.trim(),
      };
      await createApi(s).machines();
      connect(s);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không thể kết nối.");
    } finally {
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
            Token chỉ được giữ trong phiên đang mở.
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
          <h2>Kết nối hệ thống</h2>
          <p>Mở giao diện trên máy backend để dùng địa chỉ mặc định.</p>
          <label>
            Địa chỉ API
            <input
              type="url"
              required
              value={base}
              onChange={(e) => setBase(e.target.value)}
              placeholder="http://localhost:3000"
              autoComplete="url"
            />
          </label>
          <label>
            Token đọc
            <input
              type="password"
              required={!write.trim()}
              value={read}
              onChange={(e) => setRead(e.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
          </label>
          <label>
            Token thao tác <span className="muted">· tùy chọn</span>
            <input
              type="password"
              value={write}
              onChange={(e) => setWrite(e.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
          </label>
          <p className="help">
            Cần token thao tác để xác nhận cảnh báo và cấu hình. Đóng hoặc tải
            lại trang sẽ xóa token.
          </p>
          {error && <Notice tone="bad">{error}</Notice>}
          <button className="primary wide" disabled={busy}>
            {busy ? "Đang kiểm tra…" : "Kết nối API"}
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

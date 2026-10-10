import { useRef, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { accountsApi, roleLabel, type Account } from "../api/accounts";
import { useSession } from "../session";
import { Notice, stamp } from "../components/ui";
export function PasswordChange() {
  const { session, disconnect } = useSession();
  const pending = useRef(false);
  const [current, setCurrent] = useState(""),
    [password, setPassword] = useState(""),
    [confirm, setConfirm] = useState("");
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (pending.current) return;
    if (password !== confirm) {
      setError("Hai mật khẩu mới chưa khớp.");
      return;
    }
    if (new TextEncoder().encode(password).length > 256) {
      setError(
        "Mật khẩu vượt 256 byte. Rút ngắn mật khẩu; ký tự có dấu có thể chiếm nhiều byte.",
      );
      return;
    }
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      await accountsApi(session!).password(current, password);
      disconnect();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không đổi được mật khẩu.");
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <section className="account-panel">
      <h1>Đổi mật khẩu</h1>
      <p>
        {session?.user?.mustChangePassword
          ? "Đặt mật khẩu riêng trước khi sử dụng hệ thống."
          : "Sau khi đổi, hãy đăng nhập lại bằng mật khẩu mới."}
      </p>
      <form onSubmit={submit} className="account-form">
        <label>
          Mật khẩu hiện tại
          <input
            disabled={busy}
            type="password"
            autoComplete="current-password"
            required
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
          />
        </label>
        <label>
          Mật khẩu mới
          <input
            disabled={busy}
            type="password"
            autoComplete="new-password"
            minLength={12}
            maxLength={256}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <label>
          Nhập lại mật khẩu mới
          <input
            disabled={busy}
            type="password"
            autoComplete="new-password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </label>
        <p>Tối thiểu 12 ký tự.</p>
        {error && <Notice tone="bad">{error}</Notice>}
        <button className="primary" disabled={busy}>
          {busy ? "Đang lưu…" : "Lưu và đăng nhập lại"}
        </button>
      </form>
    </section>
  );
}
export function Accounts() {
  const { session } = useSession();
  const cache = useQueryClient();
  const api = accountsApi(session!);
  const pending = useRef(false);
  const users = useQuery({ queryKey: ["accounts"], queryFn: api.list });
  const history = useQuery({ queryKey: ["account-audit"], queryFn: api.audit });
  const [name, setName] = useState(""),
    [password, setPassword] = useState(""),
    [role, setRole] = useState("viewer");
  const [selected, setSelected] = useState<Account | null>(null),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  async function run(action: () => Promise<unknown>, message: string) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await action();
      setMessage(message);
      setPassword("");
      setSelected(null);
      await cache.invalidateQueries({ queryKey: ["accounts"] });
      await cache.invalidateQueries({ queryKey: ["account-audit"] });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không lưu được tài khoản.");
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  function submit(e: FormEvent) {
    e.preventDefault();
    if (pending.current) return;
    if (new TextEncoder().encode(password).length > 256) {
      setError(
        "Mật khẩu vượt 256 byte. Rút ngắn mật khẩu; ký tự có dấu có thể chiếm nhiều byte.",
      );
      return;
    }
    void run(
      () =>
        selected
          ? api.update(selected.id, { password })
          : api.create(name.trim(), password, role),
      selected
        ? "Đã đặt lại mật khẩu và thu hồi các phiên đăng nhập."
        : "Đã tạo tài khoản. Nhân viên cần đổi mật khẩu lần đầu.",
    );
  }
  return (
    <section>
      <h1>Nhân viên</h1>
      <p>Cấp quyền xem hoặc thao tác cho từng nhân viên.</p>
      {error && <Notice tone="bad">{error}</Notice>}
      {message && <p role="status">{message}</p>}
      <form onSubmit={submit} className="account-form">
        <h2>
          {selected
            ? `Đặt lại mật khẩu: ${selected.username}`
            : "Tạo tài khoản"}
        </h2>
        {!selected && (
          <>
            <label>
              Tên đăng nhập
              <input
                disabled={busy}
                required
                minLength={3}
                maxLength={48}
                pattern="[a-zA-Z0-9][a-zA-Z0-9_.-]+"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label>
              Quyền
              <select
                disabled={busy}
                value={role}
                onChange={(e) => setRole(e.target.value)}
              >
                <option value="viewer">Viewer · Chỉ xem</option>
                <option value="technician">Technician · Kỹ thuật</option>
              </select>
            </label>
          </>
        )}
        <label>
          Mật khẩu tạm
          <input
            disabled={busy}
            type="password"
            autoComplete="new-password"
            required
            minLength={12}
            maxLength={256}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <p>Tối thiểu 12 ký tự. Gửi riêng cho nhân viên.</p>
        <button className="primary" disabled={busy}>
          {busy ? "Đang lưu…" : selected ? "Đặt lại mật khẩu" : "Tạo tài khoản"}
        </button>
        {selected && (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setSelected(null);
              setPassword("");
            }}
          >
            Hủy
          </button>
        )}
      </form>
      {users.isPending ? (
        <p role="status">Đang tải nhân viên…</p>
      ) : users.error ? (
        <Notice tone="bad">{users.error.message}</Notice>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Tài khoản</th>
                <th>Quyền</th>
                <th>Trạng thái</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {users.data?.map((u) => (
                <tr key={u.id}>
                  <td>{u.username}</td>
                  <td>
                    {u.role === "admin" ? (
                      roleLabel.admin
                    ) : (
                      <select
                        aria-label={`Quyền của ${u.username}`}
                        disabled={busy}
                        value={u.role}
                        onChange={(e) =>
                          void run(
                            () => api.update(u.id, { role: e.target.value }),
                            "Đã đổi quyền và thu hồi phiên đăng nhập.",
                          )
                        }
                      >
                        <option value="viewer">Viewer</option>
                        <option value="technician">Technician</option>
                      </select>
                    )}
                  </td>
                  <td>
                    {u.disabled
                      ? "Đã khóa"
                      : u.mustChangePassword
                        ? "Cần đổi mật khẩu"
                        : "Hoạt động"}
                  </td>
                  <td>
                    {u.role !== "admin" && (
                      <>
                        <button
                          disabled={busy}
                          onClick={() =>
                            void run(
                              () => api.update(u.id, { disabled: !u.disabled }),
                              u.disabled
                                ? "Đã mở khóa."
                                : "Đã khóa và thu hồi phiên đăng nhập.",
                            )
                          }
                        >
                          {u.disabled ? "Mở khóa" : "Khóa"}
                        </button>
                        <button
                          disabled={busy}
                          onClick={() => {
                            setSelected(u);
                            setPassword("");
                          }}
                        >
                          Đặt lại mật khẩu
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <h2>Lịch sử thao tác</h2>
      {history.error && <Notice tone="bad">{history.error.message}</Notice>}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Thời gian</th>
              <th>Người thực hiện</th>
              <th>Thao tác</th>
              <th>Đối tượng</th>
              <th>Kết quả</th>
            </tr>
          </thead>
          <tbody>
            {history.data?.map((a) => (
              <tr key={a.id}>
                <td>{stamp(a.created_at)}</td>
                <td>{a.username ?? "—"}</td>
                <td>{a.action}</td>
                <td>{a.target}</td>
                <td>{a.outcome}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

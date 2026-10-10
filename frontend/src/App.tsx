import { Accounts, PasswordChange } from "./pages/Accounts";
import { roleLabel } from "./api/accounts";
import { Component, Suspense, lazy, useEffect, type ReactNode } from "react";
import { Link, NavLink, Route, Routes, useLocation } from "react-router-dom";
import {
  Bell,
  BookOpen,
  ExternalLink,
  LayoutList,
  LogOut,
  Settings2,
  Users,
  KeyRound,
  Unplug,
} from "lucide-react";
import { useSession } from "./session";
import { Connection } from "./pages/Connection";
import { Machines } from "./pages/Machines";
const MachineDetail = lazy(() =>
  import("./pages/MachineDetail").then((m) => ({ default: m.MachineDetail })),
);
import { Alarms } from "./pages/Alarms";
import { Commissioning } from "./pages/Commissioning";
export class ErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <main className="error-page">
        <h1>Giao diện gặp lỗi</h1>
        <p>
          Tải lại trang để bắt đầu phiên mới. Nếu vừa gửi cấu hình, hãy đối
          chiếu lịch sử thao tác trước khi gửi lại.
        </p>
        <button onClick={() => location.reload()}>Tải lại</button>
      </main>
    ) : (
      this.props.children
    );
  }
}
export function App() {
  const { session, disconnect } = useSession();
  const location = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [location.pathname]);
  if (!session) return <Connection />;
  return (
    <div className="app-shell">
      <a className="skip-link" href="#content">
        Đến nội dung chính
      </a>
      <aside className="sidebar">
        <Link className="brand" to="/machines">
          <span className="brand-mark">
            <Unplug size={20} />
          </span>
          LEGACY<span>LINK</span>
        </Link>
        <p className="sidebar-caption">Sổ vận hành</p>
        <nav aria-label="Điều hướng chính">
          <NavLink to="/machines">
            <LayoutList size={18} />
            Thiết bị
          </NavLink>
          <NavLink to="/alarms">
            <Bell size={18} />
            Cảnh báo
          </NavLink>
          {session.writeToken && (
            <NavLink to="/commissioning">
              <Settings2 size={18} />
              Cấu hình
            </NavLink>
          )}
          {session.user?.role === "admin" && (
            <NavLink to="/accounts">
              <Users size={18} />
              Nhân viên
            </NavLink>
          )}
          {session.user && (
            <NavLink to="/password">
              <KeyRound size={18} />
              Đổi mật khẩu
            </NavLink>
          )}
        </nav>
        <div className="sidebar-bottom">
          <BookOpen size={19} />
          <p>
            Dữ liệu rõ ràng.
            <br />
            Thao tác có kiểm chứng.
          </p>
          <span>Factory Hacks 2026</span>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <span className="endpoint">
            <ExternalLink size={14} />
            {session.base}
          </span>
          <span className="session-role">
            {session.user
              ? `${session.user.username} · ${roleLabel[session.user.role]}`
              : session.writeToken
                ? "Có quyền thao tác"
                : "Phiên chỉ đọc"}
          </span>
          <button className="quiet" onClick={disconnect}>
            <LogOut size={16} />
            Đăng xuất
          </button>
        </header>
        <main id="content" tabIndex={-1}>
          {session.user?.mustChangePassword ? (
            <PasswordChange />
          ) : (
            <>
              <Suspense fallback={<p role="status">Đang mở màn hình…</p>}>
                <Routes>
                  <Route
                    path="/accounts"
                    element={
                      session.user?.role === "admin" ? (
                        <Accounts />
                      ) : (
                        <p>Không có quyền quản lý tài khoản.</p>
                      )
                    }
                  />
                  <Route path="/password" element={<PasswordChange />} />
                  <Route path="/" element={<Machines />} />
                  <Route path="/machines" element={<Machines />} />
                  <Route path="/machines/:id" element={<MachineDetail />} />
                  <Route path="/alarms" element={<Alarms />} />
                  <Route
                    path="/commissioning"
                    element={
                      session.writeToken ? null : (
                        <p>Cần quyền Technician để cấu hình thiết bị.</p>
                      )
                    }
                  />
                  <Route
                    path="*"
                    element={
                      <>
                        <h1>Không tìm thấy trang</h1>
                        <Link to="/machines">Về danh sách thiết bị</Link>
                      </>
                    }
                  />
                </Routes>
              </Suspense>
              {session.writeToken && (
                <Commissioning
                  active={location.pathname === "/commissioning"}
                />
              )}
            </>
          )}
        </main>
        <footer>
          Legacy-link · Số đo thật cần được đối chiếu với nguồn thiết bị · GMT+7
        </footer>
      </div>
    </div>
  );
}

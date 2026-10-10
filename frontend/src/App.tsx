import { tr, useLanguage } from "./language";
import { LanguageToggle } from "./components/LanguageToggle";
import { Accounts, PasswordChange } from "./pages/Accounts";
import { roleLabel } from "./api/accounts";
import { Component, Suspense, lazy, useEffect, type ReactNode } from "react";
import { Link, NavLink, Route, Routes, useLocation } from "react-router-dom";
import {
  Bell,
  BookOpen,
  UserRound,
  Home,
  LayoutList,
  LogOut,
  Settings2,
  Users,
  KeyRound,
} from "lucide-react";
import { useSession } from "./session";
import { Connection } from "./pages/Connection";
import { Overview } from "./pages/Overview";
import { Machines } from "./pages/Machines";
const MachineDetail = lazy(() =>
  import("./pages/MachineDetail").then((m) => ({ default: m.MachineDetail })),
);
import { Copilot } from "./components/Copilot";
import { Alarms } from "./pages/Alarms";
import "./dashboard.css";
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
        <h1>{tr("Giao diện gặp lỗi")}</h1>
        <p>
          {tr(
            "Tải lại trang để bắt đầu phiên mới. Nếu vừa gửi cấu hình, hãy đối chiếu lịch sử thao tác trước khi gửi lại.",
          )}
        </p>
        <button onClick={() => location.reload()}>{tr("Tải lại")}</button>
      </main>
    ) : (
      this.props.children
    );
  }
}
export function App() {
  useLanguage();
  const { session, disconnect } = useSession();
  const location = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [location.pathname]);
  if (!session) return <Connection />;
  return (
    <div className="app-shell">
      <a className="skip-link" href="#content">
        {tr("Đến nội dung chính")}
      </a>
      <aside className="sidebar">
        <Link className="brand dashboard-brand" to="/machines">
          <strong>DENSO</strong>
          <span>Legacy Link</span>
        </Link>
        <nav aria-label={tr("Điều hướng chính")}>
          <NavLink to="/overview">
            <Home size={18} />
            {tr("Tổng quan")}
          </NavLink>
          <NavLink to="/machines">
            <LayoutList size={18} />
            {tr("Thiết bị")}
          </NavLink>
          <NavLink to="/alarms">
            <Bell size={18} />
            {tr("Cảnh báo")}
          </NavLink>
          {session.writeToken && (
            <NavLink to="/commissioning" aria-label="Cấu hình">
              <Settings2 size={18} />
              {tr("Cấu hình")}
            </NavLink>
          )}
          {session.user?.role === "admin" && (
            <NavLink to="/accounts">
              <Users size={18} />
              {tr("Nhân viên")}
            </NavLink>
          )}
          {session.user && (
            <NavLink to="/password">
              <KeyRound size={18} />
              {tr("Đổi mật khẩu")}
            </NavLink>
          )}
        </nav>
        <div className="sidebar-bottom">
          <BookOpen size={19} />
          <p>
            {tr("Dữ liệu rõ ràng.")}
            <br />
            {tr("Thao tác có kiểm chứng.")}
          </p>
          <span>Factory Hacks 2026</span>
        </div>
      </aside>
      <Copilot />
      <div className="workspace">
        <header className="topbar">
          <span
            className="session-role"
            title={session.user ? tr(roleLabel[session.user.role]) : tr("Phiên chỉ đọc")}
          >
            <span className="user-avatar">
              <UserRound size={17} />
            </span>
            {session.user?.username || tr("Chỉ đọc")}
          </span>
          <LanguageToggle />
          <button
            className="quiet dashboard-logout"
            aria-label={tr("Đăng xuất")}
            title={tr("Đăng xuất")}
            onClick={disconnect}
          >
            <LogOut size={16} />
          <NavLink to="/machines">
            <LayoutList size={18} />
            {tr("Thiết bị")}
          </NavLink>
          <NavLink to="/alarms">
            <Bell size={18} />
            {tr("Cảnh báo")}
          </NavLink>
          {session.writeToken && (
            <NavLink to="/commissioning" aria-label="Cấu hình">
              <Settings2 size={18} />
              {tr("Cấu hình")}
            </NavLink>
          )}
          {session.user?.role === "admin" && (
            <NavLink to="/accounts">
              <Users size={18} />
              {tr("Nhân viên")}
            </NavLink>
          )}
          {session.user && (
            <NavLink to="/password">
              <KeyRound size={18} />
              {tr("Đổi mật khẩu")}
            </NavLink>
          )}
        </nav>
        <div className="sidebar-bottom">
          <BookOpen size={19} />
          <p>
            {tr("Dữ liệu rõ ràng.")}
            <br />
            {tr("Thao tác có kiểm chứng.")}
          </p>
          <span>Factory Hacks 2026</span>
        </div>
      </aside>
      <Copilot />
      <div className="workspace">
        <header className="topbar">
          <span
            className="session-role"
            title={session.user ? tr(roleLabel[session.user.role]) : tr("Phiên chỉ đọc")}
          >
            <span className="user-avatar">
              <UserRound size={17} />
            </span>
            {session.user?.username || tr("Chỉ đọc")}
          </span>
          <LanguageToggle />
          <button
            className="quiet dashboard-logout"
            aria-label={tr("Đăng xuất")}
            title={tr("Đăng xuất")}
            onClick={disconnect}
          >
            <LogOut size={16} />
          </button>
        </header>
        <main id="content" tabIndex={-1}>
          {session.user?.mustChangePassword ? (
            <PasswordChange />
          ) : (
            <>
              <Suspense
                fallback={<p role="status">{tr("Đang mở màn hình…")}</p>}
              >
                <Routes>
                  <Route
                    path="/accounts"
                    element={
                      session.user?.role === "admin" ? (
                        <Accounts />
                      ) : (
                        <p>{tr("Không có quyền quản lý tài khoản.")}</p>
                      )
                    }
                  />
                  <Route path="/password" element={<PasswordChange />} />
                  <Route path="/" element={<Machines />} />
                  <Route path="/overview" element={<Overview />} />
                  <Route path="/machines" element={<Machines />} />
                  <Route path="/machines/:id" element={<MachineDetail />} />
                  <Route path="/alarms" element={<Alarms />} />
                  <Route
                    path="/commissioning"
                    element={
                      session.writeToken ? null : (
                        <p>
                          {tr("Cần quyền Technician để cấu hình thiết bị.")}
                        </p>
                      )
                    }
                  />
                  <Route
                    path="*"
                    element={
                      <>
                        <h1>{tr("Không tìm thấy trang")}</h1>
                        <Link to="/machines">
                          {tr("Về danh sách thiết bị")}
                        </Link>
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
          {tr(
            "Legacy-link · Số đo thật cần được đối chiếu với nguồn thiết bị · GMT+7",
          )}
        </footer>
      </div>
    </div>
  );
}

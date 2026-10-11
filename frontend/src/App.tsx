import { DesktopControls } from "./desktop";
import { tr, useLanguage } from "./language";
import { LanguageToggle } from "./components/LanguageToggle";
import { Accounts, PasswordChange } from "./pages/Accounts";
import { roleLabel } from "./api/accounts";
import { Component, Suspense, lazy, useEffect, useRef, useState, type ReactNode } from "react";
import { Link, NavLink, Route, Routes, useLocation } from "react-router-dom";
import {
  Bell,
  BookOpen,
  Home,
  UserRound,
  LayoutList,
  LogOut,
  Settings2,
  Users,
  KeyRound,
} from "lucide-react";
import { useSession } from "./session";
import { AnimatedLoginBackground } from "./components/AnimatedLoginBackground";
import { DashboardTransition } from "./components/DashboardTransition";
import { SlidingSidebarIndicator } from "./components/SlidingSidebarIndicator";
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
  const nav = useRef<HTMLElement>(null);
  const [collapsing, setCollapsing] = useState(false);
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [location.pathname]);
  const wallpaper = <div className={`ll-login ll-morph-surface${session || collapsing ? " collapsed" : ""}`} aria-hidden="true"><AnimatedLoginBackground /></div>;
  if (!session) return <><DesktopControls />{wallpaper}<Connection onEntering={() => setCollapsing(true)} onAbort={() => setCollapsing(false)} /></>;
  return (
    <>{wallpaper}<div className="app-shell">
      <a className="skip-link" href="#content">
        {tr("Đến nội dung chính")}
      </a>
      <aside className="sidebar">
        <Link className="brand dashboard-brand" to="/machines">
          <span className="dashboard-logo" aria-hidden="true"><svg viewBox="0 0 32 40" fill="none"><path d="M4 4h21v9H13v9h12v10H4V4Z" stroke="currentColor" strokeWidth="4"/><path d="m13 13 13-9M13 23l13-9M4 35l21-10" stroke="#5772ff" strokeWidth="3"/></svg></span><span className="dashboard-wordmark"><strong>LEGACY LINK</strong><small>/ DENSO</small></span>
        </Link>
        <nav ref={nav} aria-label={tr("Điều hướng chính")}><SlidingSidebarIndicator nav={nav} />
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
            <NavLink to="/commissioning">
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
        <header className="topbar"><div className="dashboard-breadcrumb"><Home size={18} /><span>/</span><span>{tr(location.pathname.startsWith("/machines") ? "Thiết bị" : location.pathname === "/overview" ? "Tổng quan" : location.pathname === "/alarms" ? "Cảnh báo" : location.pathname === "/commissioning" ? "Cấu hình" : location.pathname === "/accounts" ? "Nhân viên" : "Đổi mật khẩu")}</span></div>
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
            onClick={() => { setCollapsing(false); disconnect(); }}
          >
            <LogOut size={16} />
          </button>
        </header>
        <DesktopControls />
        <main id="content" tabIndex={-1}><DashboardTransition pathname={location.pathname}>
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
        </DashboardTransition></main>
        <footer>
          {tr(
            "Legacy-link · Số đo thật cần được đối chiếu với nguồn thiết bị · GMT+7",
          )}
        </footer>
      </div>
    </div></>
  );
}

import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowUpRight, Unplug } from "lucide-react";
import { normalizeUrl } from "../api/client";
import { useSession } from "../session";
import { login } from "../api/accounts";
import { AnimatedLoginBackground } from "../components/AnimatedLoginBackground";
import { LanguageToggle } from "../components/LanguageToggle";
import { tr, useLanguage } from "../language";
import "../login.css";

const copy = {
  vi: { first: "Hiểu rõ thiết bị.", active: "Chủ động", last: "vận hành.", description: "Nền tảng giám sát thông minh kết nối dữ liệu, con người và AI trong một trải nghiệm thống nhất.", welcome: "Chào mừng trở lại.", intro: "Đăng nhập để truy cập trung tâm điều hành.", username: "Tên đăng nhập", password: "Mật khẩu", userPlaceholder: "Nhập tên đăng nhập", passwordPlaceholder: "Nhập mật khẩu", note: "Tài khoản được quản lý bởi quản trị viên.", cta: "Đăng nhập & trải nghiệm", busy: "Đang kiểm tra…", entering: "Đang vào trung tâm điều hành", secure: "SECURE SESSION · Tài khoản do quản trị viên cấp", advanced: "Thiết lập kết nối", api: "Địa chỉ API", hint: "Nếu dùng máy khác, nhập IP máy backend. Backend cần cho phép origin hiện tại trong CORS. Trang HTTPS cần API HTTPS.", error: "Không thể đăng nhập. Vui lòng thử lại." },
  en: { first: "Know your machines.", active: "Take control.", last: "Operate smarter.", description: "An intelligent monitoring platform connecting data, people and AI in one unified experience.", welcome: "Welcome back.", intro: "Sign in to access your control center.", username: "Username", password: "Password", userPlaceholder: "Enter your username", passwordPlaceholder: "Enter your password", note: "Accounts are managed by your administrator.", cta: "Sign in & explore", busy: "Checking access…", entering: "Entering the control center", secure: "SECURE SESSION · Administrator-issued accounts", advanced: "Connection settings", api: "API address", hint: "On another computer, enter the backend IP. The backend must allow this origin in CORS. HTTPS pages require an HTTPS API.", error: "Unable to sign in. Please try again." },
};

export function Connection() {
  const { connect } = useSession();
  const [base, setBase] = useState(import.meta.env.VITE_API_BASE_URL || (import.meta.env.PROD ? `${location.origin}/api` : "http://localhost:3000"));
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [entering, setEntering] = useState(false);
  const [error, setError] = useState("");
  const card = useRef<HTMLElement>(null);
  const hero = useRef<HTMLDivElement>(null);
  const alive = useRef(true);
  const locked = useRef(false);
  const animations = useRef<Animation[]>([]);
  const language = useLanguage();
  const c = copy[language];
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; animations.current.forEach(a => a.cancel()); };
  }, []);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (locked.current) return;
    locked.current = true;
    setBusy(true); setError("");
    try {
      // Chỉ API thật được xác nhận tài khoản; animation không thay thế xác thực.
      const url = normalizeUrl(base);
      const result = await login(url, username.trim(), password);
      if (!alive.current) return;
      setPassword(""); setEntering(true);
      const element = card.current;
      const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      // Chờ card tới điểm cuối rồi mới đưa session vào ứng dụng, tránh redirect đột ngột.
      if (element?.animate && !reduced) {
        const rect = element.getBoundingClientRect();
        const narrow = window.innerWidth <= 760;
        const x = narrow ? 0 : Math.max(36, window.innerWidth * .062) - rect.left;
        const transform = `translate(${x}px,${narrow ? -24 : 0}px) scale(.96)`;
        const movement = element.animate([
          { transform: "translate(0,0) scale(1)", opacity: 1 },
          { transform, opacity: .96, offset: .8 },
          { transform, opacity: 0 },
        ], { duration: 1100, easing: "cubic-bezier(.22,1,.36,1)", fill: "forwards" });
        animations.current.push(movement);
        if (hero.current) animations.current.push(hero.current.animate([{ opacity: 1, transform: "translateX(0)" }, { opacity: 0, transform: "translateX(-30px)" }], { duration: 550, fill: "forwards", easing: "ease-out" }));
        await movement.finished;
      }
      if (!alive.current) return;
      connect({ base: url, readToken: result.token, writeToken: result.user.role === "viewer" ? "" : result.token, user: result.user });
    } catch (e) {
      if (!alive.current) return;
      animations.current.forEach(a => a.cancel()); animations.current = [];
      setEntering(false);
      setError(e instanceof Error ? e.message : c.error);
    } finally {
      if (alive.current) { locked.current = false; setBusy(false); }
    }
  }
  return <div className={`ll-login${entering ? " entering" : ""}`} lang={language}>
    <AnimatedLoginBackground />
    <main className="login-scene">
      <div className="hero" ref={hero}>
        <div className="brand"><Unplug aria-hidden="true" /><span>LEGACY LINK</span><small>/ DENSO</small></div>
        <div className="hero-copy"><p className="eyebrow">DENSO FACTORY HACKS 2026</p><h1>{c.first}<br /><em>{c.active}</em><br />{c.last}</h1><p className="description">{c.description}</p><div className="features"><span><i className="live-dot" />Real-time monitoring</span><span><b aria-hidden="true">+</b>AI-powered insights</span></div></div>
        <footer>LEGACY LINK × DENSO FACTORY HACKS</footer>
      </div>
      <div className="card-wrap"><section className={`login-card${busy && !entering ? " loading" : ""}`} ref={card} aria-labelledby="login-title" aria-busy={busy}>
        <div className="card-top"><span className="secure"><span aria-hidden="true">◈</span> SECURE ACCESS</span><LanguageToggle /></div>
        <h2 id="login-title">{tr("Đăng nhập")}</h2><p className="card-description">{tr("Đăng nhập để truy cập trung tâm điều hành.")}</p>
        <form onSubmit={submit}>
          <div className="field"><label htmlFor="login-username">{tr("Tên đăng nhập")}</label><input id="login-username" name="username" required autoComplete="username" spellCheck={false} value={username} disabled={busy} onChange={e => setUsername(e.target.value)} placeholder={c.userPlaceholder} /></div>
          <div className="field"><label htmlFor="login-password">{tr("Mật khẩu")}</label><input id="login-password" name="password" type="password" required autoComplete="current-password" spellCheck={false} value={password} disabled={busy} onChange={e => setPassword(e.target.value)} placeholder={c.passwordPlaceholder} /></div>
          <p className="account-note">{c.note}</p>
          {error && <p className="error" role="alert">{error}</p>}
          <button className="cta" aria-label={tr("Đăng nhập")} disabled={busy} type="submit"><span>{entering ? c.entering : busy ? c.busy : c.cta}</span><ArrowUpRight className="cta-arrow" aria-hidden="true" /><span className="spinner" aria-hidden="true" /></button>
          <p className="demo-note"><span aria-hidden="true">◆</span>{c.secure}</p>
          <details className="advanced"><summary>{c.advanced}</summary><label htmlFor="login-api">{c.api}</label><input id="login-api" type="url" required autoComplete="url" value={base} disabled={busy} onChange={e => setBase(e.target.value)} /><p>{c.hint}</p></details>
        </form>
        <div className="entering-label" role="status"><i className="live-dot" /><span>{c.entering}</span></div>
      </section></div>
    </main>
  </div>;
}

import { Component, createRef, type ReactNode } from "react";

export const NAVIGATION_DURATION = 450;
const menu = ["overview", "machines", "alarms", "commissioning", "accounts", "password"];
export function navigationIndex(path: string) {
  const section = path.split("/")[1] || "machines";
  return menu.indexOf(section);
}
type Props = { pathname: string; children: ReactNode };
type Snapshot = { clone: HTMLElement; height: number; direction: number } | null;

// Snapshot DOM trước khi React cập nhật: trang cũ chỉ là hình ảnh DOM bất hoạt,
// không mount API/form lần thứ hai, không làm mất state của Commissioning.
export class DashboardTransition extends Component<Props> {
  private viewport = createRef<HTMLDivElement>();
  private page = createRef<HTMLDivElement>();
  private outgoing: HTMLElement | null = null;
  private animations: Animation[] = [];
  private generation = 0;
  private stop = () => {
    this.generation++;
    this.animations.forEach(a => a.cancel()); this.animations = [];
    this.outgoing?.remove(); this.outgoing = null;
    if (this.viewport.current) this.viewport.current.style.minHeight = "";
  };
  getSnapshotBeforeUpdate(previous: Props): Snapshot {
    const page = this.page.current;
    if (previous.pathname === this.props.pathname || !page?.animate || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return null;
    const before = navigationIndex(previous.pathname), after = navigationIndex(this.props.pathname);
    // Chi tiết thiết bị cùng nhóm: fade nhẹ, không invent hướng menu.
    const direction = before < 0 || after < 0 ? 0 : Math.sign(after - before);
    const clone = page.cloneNode(true) as HTMLElement;
    clone.setAttribute("aria-hidden", "true"); clone.setAttribute("inert", "");
    clone.querySelectorAll("[id]").forEach(el => el.removeAttribute("id"));
    // Không giữ mật khẩu trong bản sao chuyển cảnh.
    clone.querySelectorAll<HTMLInputElement>('input[type="password"]').forEach(el => { el.value = ""; el.removeAttribute("value"); });
    return { clone, direction, height: page.getBoundingClientRect().height };
  }
  componentDidUpdate(previous: Props, _state: unknown, snapshot: Snapshot) {
    if (previous.pathname === this.props.pathname) return;
    this.stop();
    const viewport = this.viewport.current, page = this.page.current;
    if (!snapshot || !viewport || !page) return;
    const generation = this.generation;
    const { clone, direction, height } = snapshot;
    clone.classList.add("dashboard-page-outgoing");
    clone.style.transform = "none"; clone.style.opacity = "1";
    viewport.style.minHeight = `${Math.max(height, page.getBoundingClientRect().height)}px`;
    viewport.append(clone); this.outgoing = clone;
    const options: KeyframeAnimationOptions = { duration: NAVIGATION_DURATION, easing: "cubic-bezier(.22,1,.36,1)", fill: "both" };
    const exit = clone.animate([{ transform: "translateY(0)", opacity: 1 }, { transform: `translateY(${-direction * 42}px)`, opacity: 0 }], options);
    const enter = page.animate([{ transform: `translateY(${direction * 42}px)`, opacity: 0 }, { transform: "translateY(0)", opacity: 1 }], options);
    this.animations = [exit, enter];
    void Promise.all(this.animations.map(a => a.finished)).then(() => { if (this.generation === generation) this.stop(); }).catch(() => {});
  }
  componentWillUnmount() { this.stop(); }
  render() {
    return <div className="dashboard-transition-viewport" ref={this.viewport}><div className="dashboard-page-live" ref={this.page}>{this.props.children}</div></div>;
  }
}

import { useLayoutEffect, useRef, type RefObject } from "react";
import { NAVIGATION_DURATION } from "./DashboardTransition";
import { useLocation } from "react-router-dom";

// Một DOM node duy nhất. Giữ vận tốc khi đổi hướng, không reset mỗi lần đổi route.
export function SlidingSidebarIndicator({ nav }: { nav: RefObject<HTMLElement | null> }) {
  const { pathname } = useLocation();
  const element = useRef<HTMLDivElement>(null);
  const state = useRef({ x: 0, y: 0, vx: 0, vy: 0, ready: false });
  useLayoutEffect(() => {
    let frame = 0;
    let previous = 0;
    let started = 0;
    const update = () => {
      const parent = nav.current, node = element.current;
      const active = parent?.querySelector<HTMLElement>('a[aria-current="page"]');
      if (!parent || !node || !active) { if (node) node.style.opacity = "0"; return; }
      const target = { x: active.offsetLeft, y: active.offsetTop };
      node.style.width = `${active.offsetWidth}px`; node.style.height = `${active.offsetHeight}px`;
      const s = state.current;
      const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      cancelAnimationFrame(frame);
      if (!s.ready || reduced) {
        Object.assign(s, target, { vx: 0, vy: 0, ready: true });
        node.style.transform = `translate3d(${s.x}px,${s.y}px,0)`;
        node.style.opacity = "1"; return;
      }
      node.style.opacity = "1"; previous = 0; started = 0;
      const tick = (time: number) => {
        if (!started) started = time;
        const dt = previous ? Math.min((time - previous) / 1000, .032) : 1 / 60; previous = time;
        // Spring 350/30, chia bước nhỏ để không giật khi frame rate thấp.
        const steps = Math.ceil(dt / .008), h = dt / steps;
        for (let i = 0; i < steps; i++) {
          s.vx += (350 * (target.x - s.x) - 30 * s.vx) * h;
          s.vy += (350 * (target.y - s.y) - 30 * s.vy) * h;
          s.x += s.vx * h; s.y += s.vy * h;
        }
        node.style.transform = `translate3d(${s.x}px,${s.y}px,0)`;
        if (time - started >= NAVIGATION_DURATION || Math.abs(target.x - s.x) + Math.abs(target.y - s.y) < .1 && Math.abs(s.vx) + Math.abs(s.vy) < 1) {
          Object.assign(s, target, { vx: 0, vy: 0 }); node.style.transform = `translate3d(${s.x}px,${s.y}px,0)`;
        } else frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    };
    update();
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(update) : null;
    if (nav.current) observer?.observe(nav.current);
    window.addEventListener("resize", update);
    // Scroll mobile thay đổi vị trí viewport nhưng indicator đi cùng nội dung nav.
    return () => { cancelAnimationFrame(frame); observer?.disconnect(); window.removeEventListener("resize", update); };
  }, [pathname, nav]);
  return <div ref={element} className="sidebar-active-indicator" aria-hidden="true" data-testid="sidebar-active-indicator" />;
}

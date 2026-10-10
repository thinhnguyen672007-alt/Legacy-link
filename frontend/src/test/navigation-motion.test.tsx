import { afterEach, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { DashboardTransition, navigationIndex, NAVIGATION_DURATION } from "../components/DashboardTransition";
afterEach(() => { vi.unstubAllGlobals(); delete (Element.prototype as unknown as { animate?: unknown }).animate; });
it("xác định hướng cho mọi nhóm sidebar và chi tiết thiết bị", () => {
 expect(navigationIndex('/overview')).toBeLessThan(navigationIndex('/machines'));
 expect(navigationIndex('/alarms')).toBeLessThan(navigationIndex('/commissioning'));
 expect(navigationIndex('/accounts')).toBeLessThan(navigationIndex('/password'));
 expect(navigationIndex('/machines/BENCH-01')).toBe(navigationIndex('/machines'));
});
it("đi xuống: cũ lên, mới từ dưới; đảo hướng và dọn snapshot khi chuyển nhanh", () => {
 vi.stubGlobal('matchMedia', () => ({matches:false}));
 const animate=vi.fn((..._args: unknown[]) => ({finished:new Promise<void>(()=>{}),cancel:vi.fn()}));
 Object.defineProperty(Element.prototype,'animate',{configurable:true,value:animate});
 const r=render(<DashboardTransition pathname="/machines"><h1>Thiết bị</h1></DashboardTransition>);
 r.rerender(<DashboardTransition pathname="/alarms"><h1>Cảnh báo</h1></DashboardTransition>);
 expect(animate.mock.calls[0]).toEqual([[{transform:'translateY(0)',opacity:1},{transform:'translateY(-42px)',opacity:0}],expect.objectContaining({duration:NAVIGATION_DURATION})]);
 expect(r.container.querySelectorAll('.dashboard-page-outgoing')).toHaveLength(1);
 expect(r.container.querySelector('.dashboard-page-outgoing')).toHaveAttribute('inert');
 r.rerender(<DashboardTransition pathname="/overview"><h1>Tổng quan</h1></DashboardTransition>);
 expect(r.container.querySelectorAll('.dashboard-page-outgoing')).toHaveLength(1);
 expect(animate.mock.calls[2][0]).toEqual([{transform:'translateY(0)',opacity:1},{transform:'translateY(42px)',opacity:0}]);
});
it("reduced motion không tạo trang cũ hoặc animation",()=>{
 vi.stubGlobal('matchMedia',()=>({matches:true}));
 const animate=vi.fn();Object.defineProperty(Element.prototype,'animate',{configurable:true,value:animate});
 const r=render(<DashboardTransition pathname="/machines"><h1>Thiết bị</h1></DashboardTransition>);
 r.rerender(<DashboardTransition pathname="/alarms"><h1>Cảnh báo</h1></DashboardTransition>);
 expect(animate).not.toHaveBeenCalled();expect(r.container.querySelector('.dashboard-page-outgoing')).toBeNull();
});

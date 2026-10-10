import { afterEach, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { App } from "../App";
import { SessionProvider } from "../session";
const admin = {
  id: "owner",
  username: "owner",
  role: "admin",
  disabled: false,
  mustChangePassword: false,
};
afterEach(() => vi.unstubAllGlobals());
function setup(user = admin) {
  const calls: { path: string; body: Record<string, unknown> | undefined }[] =
    [];
  const people = [user];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const path = new URL(url).pathname,
        body = init?.body ? JSON.parse(String(init.body)) : undefined;
      calls.push({ path, body });
      let out: unknown = [];
      if (path === "/auth/login") out = { token: "test-session", user };
      if (path === "/auth/logout" || path === "/auth/password")
        out = { ok: true };
      if (path === "/admin/users") out = people;
      if (path === "/admin/users/create") {
        const employee = {
          id: "employee",
          username: body.username,
          role: body.role,
          disabled: false,
          mustChangePassword: true,
        };
        people.push(employee);
        out = employee;
      }
      if (path === "/admin/users/employee") {
        Object.assign(people[1], body);
        out = people[1];
      }
      return new Response(JSON.stringify(out), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }),
  );
  render(
    <MemoryRouter>
      <SessionProvider>
        <App />
      </SessionProvider>
    </MemoryRouter>,
  );
  return calls;
}
async function signIn() {
  const u = userEvent.setup();
  await u.type(screen.getByLabelText("Tên đăng nhập"), "owner");
  await u.type(screen.getByLabelText("Mật khẩu"), "test-password-123");
  await u.click(screen.getByRole("button", { name: "Đăng nhập" }));
  return u;
}
it("admin creates an employee and can revoke access through disable", async () => {
  const calls = setup();
  const u = await signIn();
  await u.click(await screen.findByRole("link", { name: "Nhân viên" }));
  await u.type(screen.getByLabelText("Tên đăng nhập"), "employee");
  await u.type(screen.getByLabelText("Mật khẩu tạm"), "temporary-password");
  await u.selectOptions(screen.getByLabelText("Quyền"), "technician");
  await u.click(screen.getByRole("button", { name: "Tạo tài khoản" }));
  await screen.findByText("employee");
  expect(calls.find((c) => c.path === "/admin/users/create")?.body?.role).toBe(
    "technician",
  );
  await u.click(screen.getByRole("button", { name: "Khóa" }));
  await screen.findByText("Đã khóa");
  expect(calls.find((c) => c.path === "/admin/users/employee")?.body).toEqual({
    disabled: true,
  });
  expect(screen.getByLabelText("Mật khẩu tạm")).toHaveValue("");
});
it("temporary password blocks dashboard until change and requires fresh sign-in", async () => {
  const calls = setup({ ...admin, role: "viewer", mustChangePassword: true });
  const u = await signIn();
  await screen.findByRole("heading", { name: "Đổi mật khẩu" });
  expect(
    screen.queryByRole("heading", { name: "Thiết bị" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("link", { name: "Nhân viên" }),
  ).not.toBeInTheDocument();
  await u.type(
    screen.getByLabelText("Mật khẩu hiện tại"),
    "temporary-password",
  );
  await u.type(
    screen.getByLabelText("Mật khẩu mới", { exact: true }),
    "new-password-123",
  );
  await u.type(
    screen.getByLabelText("Nhập lại mật khẩu mới"),
    "new-password-123",
  );
  await u.click(screen.getByRole("button", { name: "Lưu và đăng nhập lại" }));
  await screen.findByRole("heading", { name: "Chào mừng trở lại." });
  expect(calls.some((c) => c.path === "/auth/password")).toBe(true);
});

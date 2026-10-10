import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { App } from "../App";
import { SessionProvider } from "../session";
import { setLanguage, tr } from "../language";
import { number, stamp } from "../components/ui";
import { explainError, modbusReadError } from "../api/errors";
import { config, machine } from "./fixtures";

afterEach(() => {
  act(() => setLanguage("vi"));
  localStorage.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
function mount() {
  render(
    <MemoryRouter>
      <SessionProvider>
        <App />
      </SessionProvider>
    </MemoryRouter>,
  );
}
it("switches login copy without clearing input and saves only the language", () => {
  mount();
  fireEvent.change(screen.getByLabelText("Tên đăng nhập"), {
    target: { value: "thinh" },
  });
  fireEvent.change(screen.getByLabelText("Mật khẩu"), {
    target: { value: "private-password" },
  });
  fireEvent.click(screen.getByRole("button", { name: "English" }));
  expect(screen.getByRole("heading", { name: "Sign in" })).toBeInTheDocument();
  expect(screen.getByLabelText("Username")).toHaveValue("thinh");
  expect(screen.getByLabelText("Password")).toHaveValue("private-password");
  expect(document.documentElement.lang).toBe("en");
  expect(localStorage.getItem("legacy-link.language")).toBe("en");
  expect(localStorage.length).toBe(1);
  fireEvent.click(screen.getByRole("button", { name: "Tiếng Việt" }));
  expect(screen.getByLabelText("Tên đăng nhập")).toHaveValue("thinh");
});
it("preserves session, device data and configuration draft across toggles", async () => {
  const fetch = vi.fn(async (input: string, _init?: RequestInit) => {
    void _init;
    const path = new URL(input).pathname;
    let body: unknown = [];
    if (path === "/auth/login" || path === "/auth/me") {
      const user = {
        id: "u",
        username: "thinh",
        role: "technician",
        disabled: false,
        mustChangePassword: false,
      };
      body = path === "/auth/login" ? { token: "secret-token", user } : user;
    }
    if (path === "/machines") body = [machine];
    if (path === "/gateways")
      body = [{ gatewayId: "ABCDEF123456", bootId: "boot-1", online: true }];
    if (path === "/config/preview")
      body = { error: "temperature: minimum exceeds maximum" };
    if (path === "/catalog") body = config;
    return new Response(JSON.stringify(body), {
      status: path === "/config/preview" ? 400 : 200,
    });
  });
  vi.stubGlobal("fetch", fetch);
  mount();
  fireEvent.change(screen.getByLabelText("Tên đăng nhập"), {
    target: { value: "thinh" },
  });
  fireEvent.change(screen.getByLabelText("Mật khẩu"), {
    target: { value: "password12345" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Đăng nhập" }));
  await screen.findByRole("heading", { name: "Thiết bị" });
  fireEvent.click(screen.getByRole("button", { name: "English" }));
  expect(screen.getByRole("heading", { name: "Devices" })).toBeInTheDocument();
  expect(await screen.findByText(machine.name!)).toBeInTheDocument();
  expect(screen.getByText("Connected")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("link", { name: "Configuration" }));
  await screen.findByRole("option", { name: /ABCDEF123456/ });
  fireEvent.change(await screen.findByLabelText("Gateway"), {
    target: { value: "ABCDEF123456" },
  });
  fireEvent.change(screen.getByLabelText("Device ID"), {
    target: { value: "NEW-01" },
  });
  fireEvent.change(screen.getByLabelText("Device name"), {
    target: { value: "Draft name" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Validate configuration" }),
  );
  await screen.findByText(/Expected minimum exceeds expected maximum/);
  fireEvent.click(screen.getByRole("button", { name: "Tiếng Việt" }));
  expect(screen.getByLabelText("Mã thiết bị")).toHaveValue("NEW-01");
  expect(screen.getByRole("alert")).toHaveTextContent(
    /Giá trị nhỏ nhất dự kiến/,
  );
  expect(
    fetch.mock.calls.filter(
      ([, init]) => init?.body && String(init.body).includes('"password"'),
    ),
  ).toHaveLength(1);
  expect(JSON.stringify(Object.entries(localStorage))).not.toContain(
    "secret-token",
  );
  expect(fetch.mock.calls.some(([url]) => /\/apply$/.test(url))).toBe(false);
});
it("translates detailed errors, formats numbers and keeps the GMT+7 timezone", () => {
  setLanguage("en");
  expect(tr(explainError("temperature: minimum exceeds maximum")!)).toContain(
    "Register temperature: Expected minimum",
  );
  expect(tr(modbusReadError(2))).toContain("raw address");
  expect(tr("Mã thiết bị {0} · Thời gian GMT+7", "BENCH-01")).toBe(
    "Device ID BENCH-01 · Time zone GMT+7",
  );
  expect(tr("__proto__")).toBe("__proto__");
  expect(number(1534.25)).toBe("1,534.25");
  expect(stamp("2026-10-10T00:00:00Z")).toContain("07:00:00");
});
it("keeps switching when browser storage is blocked", () => {
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("blocked");
  });
  mount();
  fireEvent.click(screen.getByRole("button", { name: "English" }));
  expect(screen.getByRole("heading", { name: "Sign in" })).toBeInTheDocument();
});
it("updates another tab's language without remounting its form", async () => {
  mount();
  fireEvent.change(screen.getByLabelText("Tên đăng nhập"), {
    target: { value: "thinh" },
  });
  localStorage.setItem("legacy-link.language", "en");
  act(() =>
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: "legacy-link.language",
        newValue: "en",
      }),
    ),
  );
  await waitFor(() =>
    expect(screen.getByLabelText("Username")).toHaveValue("thinh"),
  );
  localStorage.setItem("legacy-link.language", "invalid");
  act(() =>
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: "legacy-link.language",
        newValue: "invalid",
      }),
    ),
  );
  expect(screen.getByLabelText("Tên đăng nhập")).toHaveValue("thinh");
});

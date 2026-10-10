import { afterEach, expect, it, vi } from "vitest";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { App } from "../App";
import { SessionProvider } from "../session";
import { config, machine, operation } from "./fixtures";
const gateway = { gatewayId: "ABCDEF123456", bootId: "boot-1", online: true };
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
function mount(path = "/machines") {
  render(
    <MemoryRouter initialEntries={[path]}>
      <SessionProvider>
        <App />
      </SessionProvider>
    </MemoryRouter>,
  );
}
async function connect(writer = true, heading = "Thiết bị") {
  const u = userEvent.setup();
  await u.type(
    screen.getByLabelText("Tên đăng nhập"),
    writer ? "technician" : "viewer",
  );
  await u.type(screen.getByLabelText("Mật khẩu"), "test-password-123");
  await u.click(screen.getByRole("button", { name: "Đăng nhập" }));
  await screen.findByRole("heading", { name: heading });
  return u;
}
function fixtures() {
  const calls: { path: string; method: string; body: unknown }[] = [];
  let phase = "sent";
  let warningValue: number | undefined;
  let probeCount = 0;
  let failedRead = false;
  const resultOperation = () =>
    operation({
      id: `probe-${probeCount}`,
      phase: phase as "sent" | "completed",
      ...(failedRead
        ? {
            readings: [
              { key: "temperature", address: 1, success: false, errorCode: 2 },
            ],
          }
        : {}),
      ...(warningValue === undefined
        ? {}
        : {
            readings: [
              {
                key: "temperature",
                address: 1,
                success: true,
                errorCode: 0,
                withinRange: false,
                value: warningValue,
              },
            ],
          }),
    });
  const fetch = vi.fn(async (input: string, init?: RequestInit) => {
    const path = new URL(input).pathname;
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ path, method, body });
    let result: unknown = [];
    if (path === "/auth/login")
      result = {
        token: "fixture-session",
        user: {
          id: "employee",
          username: body.username,
          role: body.username,
          disabled: false,
          mustChangePassword: false,
        },
      };
    if (path === "/auth/logout") result = { ok: true };
    if (path === "/machines") result = [machine];
    if (path === "/machines/TEST-01") result = machine;
    if (path === "/catalog") result = config;
    if (path === "/gateways") result = [gateway];
    if (path === "/profiles")
      result = [{ id: "p", name: "Profile kiểm thử", revision: 1 }];
    if (path === "/profiles/p/export") result = { config };
    if (path === "/config/preview")
      result = {
        config: body.config,
        bytes: 300,
        warnings: [],
        requiresProbe: true,
      };
    if (path.endsWith("/probe")) {
      probeCount++;
      phase = "sent";
      result = resultOperation();
    }
    if (path === "/operations") result = [resultOperation()];
    if (path.startsWith("/operations/")) result = resultOperation();
    if (path === "/alarms")
      result = {
        items: [
          {
            id: "1",
            deviceId: "TEST-01",
            timestamp: Date.now(),
            code: "OVERHEAT",
            severity: "high",
            acknowledgedAt: null,
          },
        ],
        from: 0,
        to: Date.now(),
        nextCursor: null,
      };
    return new Response(JSON.stringify(result), {
      status: path.endsWith("/probe") ? 202 : 200,
    });
  });
  vi.stubGlobal("fetch", fetch);
  return {
    calls,
    fetch,
    warn: (value: number) => {
      warningValue = value;
    },
    failRead: () => {
      failedRead = true;
    },
    complete: () => {
      phase = "completed";
    },
  };
}
it("connects, renders real response including zero, clears session on disconnect", async () => {
  fixtures();
  mount();
  const u = await connect();
  expect(
    await screen.findByText("Thiết bị mô phỏng kiểm thử"),
  ).toBeInTheDocument();
  await u.click(screen.getByRole("button", { name: "Đăng xuất" }));
  expect(
    screen.getByRole("heading", { name: "Đăng nhập" }),
  ).toBeInTheDocument();
  expect(screen.getByLabelText("Tên đăng nhập")).toHaveValue("");
  expect(localStorage.length).toBe(0);
});
it("uses the edited machine ID for catalog reads from a device URL", async () => {
  const f = fixtures();
  mount("/commissioning?device=OLD-ID");
  const u = await connect(true, "Cấu hình thiết bị");
  await u.clear(screen.getByLabelText("Mã thiết bị"));
  await u.type(screen.getByLabelText("Mã thiết bị"), "NEW-ID");
  await u.click(screen.getByRole("button", { name: /Đọc catalog/ }));
  const url = String(
    f.fetch.mock.calls.find(
      ([url]) => new URL(url).pathname === "/catalog",
    )?.[0],
  );
  expect(new URL(url).searchParams.get("deviceId")).toBe("NEW-ID");
});
it("prepares the newly selected device instead of reusing another device draft", async () => {
  fixtures();
  mount("/commissioning?device=OLD-ID");
  const u = await connect(true, "Cấu hình thiết bị");
  expect(screen.getByLabelText("Mã thiết bị")).toHaveValue("OLD-ID");
  await u.click(screen.getByRole("link", { name: "Thiết bị" }));
  await u.click(screen.getByRole("link", { name: "Xem TEST-01" }));
  await screen.findByText("Mã thiết bị TEST-01 · Thời gian GMT+7");
  await u.click(
    screen
      .getAllByRole("link", { name: "Cấu hình" })
      .find((link) => !link.closest("nav"))!,
  );
  await waitFor(() =>
    expect(screen.getByLabelText("Mã thiết bị")).toHaveValue("TEST-01"),
  );
});
it("does not show an out-of-range override for failed reads", async () => {
  const f = fixtures();
  f.failRead();
  mount();
  const u = await connect();
  await u.click(screen.getByRole("link", { name: "Cấu hình" }));
  await u.selectOptions(
    await screen.findByLabelText("Gateway"),
    gateway.gatewayId,
  );
  await u.selectOptions(screen.getByLabelText("Profile có sẵn"), "p");
  await u.click(screen.getByRole("button", { name: "Nạp profile" }));
  await waitFor(() =>
    expect(screen.getByLabelText("Mã thiết bị")).toHaveValue("TEST-01"),
  );
  await u.click(screen.getByRole("button", { name: "Kiểm tra cấu hình" }));
  await u.dblClick(
    await screen.findByRole("button", { name: "Đọc thử trên gateway" }),
  );
  f.complete();
  await u.click(
    screen.getByRole("button", { name: "Đọc lại trạng thái thao tác" }),
  );
  await screen.findByText(/Sửa các thông số báo lỗi/);
  expect(
    screen.queryByRole("checkbox", { name: /chấp nhận số đo ngoài khoảng/ }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Xem lại và áp dụng" }),
  ).toBeDisabled();
  expect(f.calls.filter((c) => c.path.endsWith("/probe"))).toHaveLength(1);
});
it("hides configuration actions in device details for viewers", async () => {
  fixtures();
  mount();
  const u = await connect(false);
  await u.click(screen.getByRole("link", { name: "Xem TEST-01" }));
  await screen.findByText("Mã thiết bị TEST-01 · Thời gian GMT+7");
  expect(
    screen.queryByRole("link", { name: "Cấu hình" }),
  ).not.toBeInTheDocument();
});
it("clears an ambiguous ACK error after the user reloads and reconciles the alarm", async () => {
  const f = fixtures();
  const original = f.fetch.getMockImplementation()!;
  let acknowledged = false;
  f.fetch.mockImplementation(async (url, init) => {
    const path = new URL(url).pathname;
    if (path === "/alarms/1/ack") {
      acknowledged = true;
      return new Response(JSON.stringify({ error: "Temporary outage" }), {
        status: 503,
      });
    }
    const response = await original(url, init);
    if (path === "/alarms" && acknowledged) {
      const body = await response.json();
      body.items = [];
      return new Response(JSON.stringify(body));
    }
    return response;
  });
  mount();
  const u = await connect();
  await u.click(screen.getByRole("link", { name: "Cảnh báo" }));
  await u.click(await screen.findByRole("button", { name: "Đã xem" }));
  await screen.findByText(/Temporary outage/);
  await u.click(screen.getByRole("button", { name: "Đọc đến hiện tại" }));
  await screen.findByText("Không có cảnh báo khớp bộ lọc");
  expect(screen.queryByText(/Temporary outage/)).not.toBeInTheDocument();
  expect(
    f.fetch.mock.calls.filter(
      ([url]) => new URL(url).pathname === "/alarms/1/ack",
    ),
  ).toHaveLength(1);
});
it("sends one login request even if submitted twice before response", async () => {
  const f = fixtures();
  const original = f.fetch.getMockImplementation()!;
  let reply!: (r: Response) => void;
  f.fetch.mockImplementation((url, init) =>
    new URL(url).pathname === "/auth/login"
      ? new Promise<Response>((resolve) => {
          reply = resolve;
        })
      : original(url, init),
  );
  mount();
  fireEvent.change(screen.getByLabelText("Tên đăng nhập"), {
    target: { value: "technician" },
  });
  fireEvent.change(screen.getByLabelText("Mật khẩu"), {
    target: { value: "test-password-123" },
  });
  const form = screen
    .getByRole("button", { name: "Đăng nhập" })
    .closest("form")!;
  fireEvent.submit(form);
  fireEvent.submit(form);
  expect(
    f.fetch.mock.calls.filter(
      ([url]) => new URL(url).pathname === "/auth/login",
    ),
  ).toHaveLength(1);
  expect(screen.getByLabelText("Tên đăng nhập")).toBeDisabled();
  await act(async () => {
    reply(
      new Response(
        JSON.stringify({
          token: "fixture-session",
          user: {
            id: "employee",
            username: "technician",
            role: "technician",
            disabled: false,
            mustChangePassword: false,
          },
        }),
      ),
    );
  });
  await screen.findByRole("heading", { name: "Thiết bị" });
});
it("does not apply evidence that expires while the confirmation dialog is open", async () => {
  const f = fixtures();
  mount();
  const u = await connect();
  await u.click(screen.getByRole("link", { name: "Cấu hình" }));
  await u.selectOptions(
    await screen.findByLabelText("Gateway"),
    gateway.gatewayId,
  );
  await u.selectOptions(screen.getByLabelText("Profile có sẵn"), "p");
  await u.click(screen.getByRole("button", { name: "Nạp profile" }));
  await waitFor(() =>
    expect(screen.getByLabelText("Mã thiết bị")).toHaveValue("TEST-01"),
  );
  await u.click(screen.getByRole("button", { name: "Kiểm tra cấu hình" }));
  await u.click(
    await screen.findByRole("button", { name: "Đọc thử trên gateway" }),
  );
  f.complete();
  await u.click(
    screen.getByRole("button", { name: "Đọc lại trạng thái thao tác" }),
  );
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Xem lại và áp dụng" }),
    ).toBeEnabled(),
  );
  await u.click(screen.getByRole("button", { name: "Xem lại và áp dụng" }));
  const now = Date.now();
  vi.spyOn(Date, "now").mockReturnValue(now + 61000);
  await u.click(screen.getByRole("button", { name: "Áp dụng cấu hình" }));
  expect(f.calls.some((c) => c.path.endsWith("/apply"))).toBe(false);
  await screen.findByText(/Kết quả đọc thử không còn hợp lệ/);
});
it("read-only session cannot acknowledge alarms", async () => {
  fixtures();
  mount();
  const u = await connect(false);
  await u.click(screen.getByRole("link", { name: "Cảnh báo" }));
  expect(await screen.findByRole("button", { name: "Đã xem" })).toBeDisabled();
});
it("places validation error immediately below gateway status in the read/apply panel", async () => {
  const f = fixtures();
  const original = f.fetch.getMockImplementation()!;
  f.fetch.mockImplementation(async (input: string, init?: RequestInit) =>
    new URL(input).pathname === "/config/preview"
      ? new Response(
          JSON.stringify({ error: "temperature: minimum exceeds maximum" }),
          { status: 400 },
        )
      : original(input, init),
  );
  mount();
  const u = await connect();
  await u.click(screen.getByRole("link", { name: "Cấu hình" }));
  await u.selectOptions(
    await screen.findByLabelText("Gateway"),
    gateway.gatewayId,
  );
  await u.selectOptions(screen.getByLabelText("Profile có sẵn"), "p");
  await u.click(screen.getByRole("button", { name: "Nạp profile" }));
  await waitFor(() =>
    expect(screen.getByLabelText("Mã thiết bị")).toHaveValue("TEST-01"),
  );
  await u.click(screen.getByRole("button", { name: "Kiểm tra cấu hình" }));
  const message = await screen.findByText(
    /Thông số temperature:.*Giá trị nhỏ nhất dự kiến/,
  );
  const status = screen.getByText("Liên lạc được").closest(".badge")!;
  expect(status.nextElementSibling).toContainElement(message);
  expect(
    screen.getByRole("heading", { name: "Đọc thử & áp dụng" }).parentElement,
  ).toContainElement(message);
});
it("holds apply after 202, then invalidates successful probe when config changes", async () => {
  const f = fixtures();
  mount();
  const u = await connect();
  await u.click(screen.getByRole("link", { name: "Cấu hình" }));
  await u.selectOptions(
    await screen.findByLabelText("Gateway"),
    gateway.gatewayId,
  );
  await u.selectOptions(screen.getByLabelText("Profile có sẵn"), "p");
  await u.click(screen.getByRole("button", { name: "Nạp profile" }));
  await waitFor(() =>
    expect(screen.getByLabelText("Mã thiết bị")).toHaveValue("TEST-01"),
  );
  await u.click(screen.getByRole("button", { name: "Kiểm tra cấu hình" }));
  await u.click(
    await screen.findByRole("button", { name: "Đọc thử trên gateway" }),
  );
  expect(
    screen.getByRole("button", { name: "Xem lại và áp dụng" }),
  ).toBeDisabled();
  await u.click(screen.getByRole("link", { name: "Thiết bị" }));
  await screen.findByRole("heading", { name: "Thiết bị" });
  await u.click(screen.getByRole("link", { name: "Cấu hình" }));
  expect(screen.getByLabelText("Mã thiết bị")).toHaveValue("TEST-01");
  expect(
    screen.getByRole("button", { name: "Xem lại và áp dụng" }),
  ).toBeDisabled();
  f.complete();
  await u.click(
    screen.getByRole("button", { name: "Đọc lại trạng thái thao tác" }),
  );
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Xem lại và áp dụng" }),
    ).toBeEnabled(),
  );
  await u.clear(screen.getByLabelText("Địa chỉ slave"));
  await u.type(screen.getByLabelText("Địa chỉ slave"), "2");
  expect(
    screen.getByRole("button", { name: "Xem lại và áp dụng" }),
  ).toBeDisabled();
  expect(f.calls.filter((c) => c.path.endsWith("/probe"))).toHaveLength(1);
});
it("keeps previous data on an API failure", async () => {
  const f = fixtures();
  mount();
  const u = await connect();
  await screen.findByText("Thiết bị mô phỏng kiểm thử");
  f.fetch.mockImplementation(
    async () => new Response("<html/>", { status: 503 }),
  );
  await u.click(screen.getByRole("button", { name: "Cập nhật" }));
  await screen.findByText(/Dữ liệu bên dưới là bản gần nhất/);
  expect(screen.getByText("Thiết bị mô phỏng kiểm thử")).toBeInTheDocument();
});

it("requires renewed warning acceptance for every probe", async () => {
  const f = fixtures();
  f.warn(100);
  mount();
  const u = await connect();
  await u.click(screen.getByRole("link", { name: "Cấu hình" }));
  await u.selectOptions(
    await screen.findByLabelText("Gateway"),
    gateway.gatewayId,
  );
  await u.selectOptions(screen.getByLabelText("Profile có sẵn"), "p");
  await u.click(screen.getByRole("button", { name: "Nạp profile" }));
  await waitFor(() =>
    expect(screen.getByLabelText("Mã thiết bị")).toHaveValue("TEST-01"),
  );
  await u.click(screen.getByRole("button", { name: "Kiểm tra cấu hình" }));
  for (const value of [100, 200]) {
    f.warn(value);
    await u.click(
      await screen.findByRole("button", { name: "Đọc thử trên gateway" }),
    );
    f.complete();
    await u.click(
      screen.getByRole("button", { name: "Đọc lại trạng thái thao tác" }),
    );
    const accept = await screen.findByRole("checkbox", {
      name: /Tôi đã xem và chấp nhận/,
    });
    expect(accept).not.toBeChecked();
    expect(
      screen.getByRole("button", { name: "Xem lại và áp dụng" }),
    ).toBeDisabled();
    await u.click(accept);
    expect(
      screen.getByRole("button", { name: "Xem lại và áp dụng" }),
    ).toBeEnabled();
  }
  expect(f.calls.filter((c) => c.path.endsWith("/probe"))).toHaveLength(2);
});
it("shows operation identity and snapshot before allowing reconciliation", async () => {
  fixtures();
  mount();
  const u = await connect();
  await u.click(screen.getByRole("link", { name: "Cấu hình" }));
  await u.selectOptions(
    await screen.findByLabelText("Gateway"),
    gateway.gatewayId,
  );
  await u.click(screen.getByRole("button", { name: "Đọc lịch sử gateway" }));
  const follow = await screen.findByRole("button", {
    name: "Theo dõi thao tác này",
  });
  expect(follow).toBeDisabled();
  expect(screen.getByText("TEST-01")).toBeInTheDocument();
  await u.click(screen.getByText("Xem cấu hình của thao tác"));
  expect(screen.getByText(/"registerMap":/)).toBeVisible();
  await u.click(
    screen.getByRole("checkbox", { name: /Tôi đã đối chiếu thiết bị/ }),
  );
  expect(follow).toBeEnabled();
  await u.click(follow);
  expect(
    await screen.findByRole("button", { name: "Đọc lại trạng thái thao tác" }),
  ).toBeEnabled();
});

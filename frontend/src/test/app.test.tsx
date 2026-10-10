import { afterEach, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { App } from "../App";
import { SessionProvider } from "../session";
import { config, machine, operation } from "./fixtures";
const gateway = { gatewayId: "ABCDEF123456", bootId: "boot-1", online: true };
afterEach(() => vi.unstubAllGlobals());
function mount() {
  render(
    <MemoryRouter initialEntries={["/machines"]}>
      <SessionProvider>
        <App />
      </SessionProvider>
    </MemoryRouter>,
  );
}
async function connect(writer = true) {
  const u = userEvent.setup();
  await u.type(screen.getByLabelText("Token đọc"), "fixture-read");
  if (writer)
    await u.type(screen.getByLabelText(/Token thao tác/), "fixture-write");
  await u.click(screen.getByRole("button", { name: "Kết nối API" }));
  await screen.findByRole("heading", { name: "Thiết bị" });
  return u;
}
function fixtures() {
  const calls: { path: string; method: string; body: unknown }[] = [];
  let phase = "sent";
  let warningValue: number | undefined;
  let probeCount = 0;
  const resultOperation = () =>
    operation({
      id: `probe-${probeCount}`,
      phase: phase as "sent" | "completed",
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
    if (path === "/machines") result = [machine];
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
  await u.click(screen.getByRole("button", { name: "Ngắt kết nối" }));
  expect(
    screen.getByRole("heading", { name: "Kết nối hệ thống" }),
  ).toBeInTheDocument();
  expect(screen.getByLabelText("Token đọc")).toHaveValue("");
  expect(localStorage.length).toBe(0);
});
it("read-only session cannot acknowledge alarms", async () => {
  fixtures();
  mount();
  const u = await connect(false);
  await u.click(screen.getByRole("link", { name: "Cảnh báo" }));
  expect(await screen.findByRole("button", { name: "Đã xem" })).toBeDisabled();
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

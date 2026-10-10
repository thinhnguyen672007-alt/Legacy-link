import { expect, it, vi, afterEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { Copilot } from "../components/Copilot";
import { SessionProvider } from "../session";
afterEach(() => vi.unstubAllGlobals());
it.each(["   ", "  Kiểm tra BENCH-01  "])(
  "trims the question and does not submit blank input: %s",
  async (question) => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            conversationId: "fixture",
            mode: "rules",
            text: "Fixture answer",
            notice: null,
            results: [],
          }),
        ),
      );
    vi.stubGlobal("fetch", fetch);
    render(
      <MemoryRouter>
        <SessionProvider>
          <Copilot />
        </SessionProvider>
      </MemoryRouter>,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Hỏi về máy/ }));
    fireEvent.change(screen.getByLabelText("Câu hỏi về thiết bị"), {
      target: { value: question },
    });
    fireEvent.submit(
      screen.getByRole("button", { name: "Gửi câu hỏi" }).closest("form")!,
    );
    if (!question.trim()) {
      expect(fetch).not.toHaveBeenCalled();
      return;
    }
    await screen.findByText("Fixture answer");
    expect(JSON.parse(fetch.mock.calls[0][1].body).question).toBe(
      question.trim(),
    );
  },
);
it("Nút UNDERHEAT gọi API và hiển thị lỗi thật, không sinh máy giả", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValue(
      new Response(JSON.stringify({ error: "Database không khả dụng" }), {
        status: 503,
      }),
    );
  vi.stubGlobal("fetch", fetch);
  render(
    <MemoryRouter>
      <SessionProvider>
        <Copilot />
      </SessionProvider>
    </MemoryRouter>,
  );
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: /Hỏi về máy/ }));
  await user.click(screen.getByRole("button", { name: "Nhiệt độ thấp" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Database không khả dụng",
  );
  expect(fetch).toHaveBeenCalledWith(
    "/ai/query",
    expect.objectContaining({ body: JSON.stringify({ action: "underheat" }) }),
  );
});
it("Panel render số đo từ API, link máy theo ID và thông báo bộ quy tắc", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            conversationId: "demo",
            mode: "rules",
            text: "Backend đã kiểm tra",
            notice: "Chưa cấu hình Gemini",
            results: [
              {
                tool: "get_devices_by_temperature_status",
                source: "database",
                queriedAt: new Date().toISOString(),
                devices: [
                  {
                    deviceId: "BENCH-01",
                    name: "Bench",
                    gatewayOnline: true,
                    dataFresh: true,
                    temperatures: [
                      {
                        metricKey: "temperature",
                        unit: "°C",
                        value: 19,
                        low: 20,
                        high: 80,
                        status: "underheat",
                        reason: null,
                        measuredAt: new Date().toISOString(),
                      },
                    ],
                  },
                ],
              },
            ],
          }),
        ),
      ),
  );
  render(
    <MemoryRouter>
      <SessionProvider>
        <Copilot />
      </SessionProvider>
    </MemoryRouter>,
  );
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: /Hỏi về máy/ }));
  await user.click(screen.getByRole("button", { name: "Nhiệt độ thấp" }));
  expect(await screen.findByText("Dưới ngưỡng nhiệt")).toBeVisible();
  expect(screen.getByRole("link", { name: /BENCH-01/ })).toHaveAttribute(
    "href",
    "/machines/BENCH-01",
  );
  expect(screen.getByText("Chưa cấu hình Gemini")).toBeVisible();
});

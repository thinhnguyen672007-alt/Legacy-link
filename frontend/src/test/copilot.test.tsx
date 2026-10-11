import { expect, it, vi, afterEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { act } from "@testing-library/react";
import { setLanguage } from "../language";
import { Copilot } from "../components/Copilot";
import { SessionProvider } from "../session";
afterEach(() => vi.unstubAllGlobals());
it.each(["   ", "  Kiểm tra BENCH-01  "])(
  "trims the question and does not submit blank input: %s",
  async (question) => {
    const fetch = vi.fn().mockResolvedValue(
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
  const fetch = vi.fn().mockResolvedValue(
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
    expect.objectContaining({
      body: JSON.stringify({ action: "underheat", language: "vi" }),
    }),
  );
});
it("Panel render số đo từ API, link máy theo ID và thông báo bộ quy tắc", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
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
  await screen.findByText("Dưới ngưỡng nhiệt");
  await user.click(screen.getByText("Xem dữ liệu và nguồn kiểm chứng"));
  expect(screen.getByText("Dưới ngưỡng nhiệt")).toBeVisible();
  expect(screen.getByRole("link", { name: /BENCH-01/ })).toHaveAttribute(
    "href",
    "/machines/BENCH-01",
  );
  expect(screen.getByText("Chưa cấu hình Gemini")).toBeVisible();
});
it("history keeps more than ten turns, searches exact questions and selects their answer without changing context", async () => {
  let index = 0;
  const fetch = vi.fn().mockImplementation(() =>
    Promise.resolve(
      new Response(
        JSON.stringify({
          conversationId: "same-conversation",
          mode: "rules",
          text: `Answer ${++index}`,
          notice: null,
          results: [],
        }),
      ),
    ),
  );
  vi.stubGlobal("fetch", fetch);
  const scroll = vi.fn();
  Object.defineProperty(Element.prototype, "scrollIntoView", {
    configurable: true,
    value: scroll,
  });
  render(
    <MemoryRouter>
      <SessionProvider>
        <Copilot />
      </SessionProvider>
    </MemoryRouter>,
  );
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: /Hỏi về máy/ }));
  for (let i = 1; i <= 12; i++) {
    fireEvent.change(screen.getByLabelText("Câu hỏi về thiết bị"), {
      target: { value: `Question ${i}` },
    });
    fireEvent.submit(
      screen.getByRole("button", { name: "Gửi câu hỏi" }).closest("form")!,
    );
    await screen.findByText(`Answer ${i}`);
  }
  expect(screen.getByText("Answer 1")).toBeInTheDocument();
  const search = screen.getByLabelText("Tìm trong lịch sử");
  fireEvent.change(search, { target: { value: "Question 12" } });
  expect(
    screen.queryByRole("button", { name: /Question 11/ }),
  ).not.toBeInTheDocument();
  const older = screen.getByRole("button", { name: /Question 12/ });
  await user.click(older);
  expect(older).toHaveAttribute("aria-current", "true");
  expect(scroll).toHaveBeenLastCalledWith({ block: "start", behavior: "auto" });
  expect(JSON.parse(fetch.mock.calls.at(-1)![1].body).conversationId).toBe(
    "same-conversation",
  );
  fireEvent.change(search, { target: { value: "missing" } });
  expect(screen.getByText("Không tìm thấy câu hỏi.")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Đóng AI DENSO" }));
  await user.click(screen.getByRole("button", { name: /Hỏi về máy/ }));
  expect(screen.getByText("Answer 1")).toBeInTheDocument();
});

it("English history searches the displayed quick-action label; no query time is invented without results", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            conversationId: "english",
            mode: "rules",
            text: "No evidence available",
            notice: null,
            results: [],
          }),
        ),
      ),
  );
  act(() => setLanguage("en"));
  render(
    <MemoryRouter>
      <SessionProvider>
        <Copilot />
      </SessionProvider>
    </MemoryRouter>,
  );
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: /Ask about machines/ }));
  await user.click(screen.getByRole("button", { name: "Low temperature" }));
  await screen.findByText("No evidence available");
  fireEvent.change(screen.getByLabelText("Search history"), {
    target: { value: "Low temperature" },
  });
  expect(screen.getByRole("button", { name: /Low temperature/ })).toBeVisible();
  expect(screen.queryByText(/Queried at/)).not.toBeInTheDocument();
  act(() => setLanguage("vi"));
});
it("a failed tool leaves partial warning visible even when retrieved results have no partial flag", async () => {
  const time = new Date().toISOString();
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            conversationId: "partial",
            mode: "gemini",
            notice: null,
            text: "One device checked",
            results: [
              {
                tool: "get_device_status",
                evidenceId: "e1",
                source: "database",
                queriedAt: time,
                devices: [],
              },
            ],
            report: {
              version: 1,
              status: "partial",
              generatedAt: time,
              view: "brief",
              findings: [],
              followUp: "",
              limitations: ["History tool failed"],
              evidence: [
                { id: "e1", tool: "get_device_status", queriedAt: time },
              ],
              trace: [
                {
                  tool: "get_device_telemetry_history",
                  round: 1,
                  status: "error",
                  durationMs: 1,
                  error: "History unavailable",
                },
              ],
              failureConfirmed: false,
            },
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
  fireEvent.change(screen.getByLabelText("Câu hỏi về thiết bị"), {
    target: { value: "Investigate device" },
  });
  fireEvent.submit(
    screen.getByRole("button", { name: "Gửi câu hỏi" }).closest("form")!,
  );
  expect(
    await screen.findByText(/Kết quả chưa đầy đủ; không kết luận/),
  ).toBeVisible();
});

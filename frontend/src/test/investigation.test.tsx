import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { copilotSchema, type CopilotResponse } from "../api/schema";
import { InvestigationView } from "../components/InvestigationView";
import { setLanguage } from "../language";

const time = "2026-10-10T14:00:00.000Z";
function response(): CopilotResponse {
  return {
    conversationId: "investigation-fixture",
    mode: "gemini",
    text: "Gateway mất kết nối; chưa xác nhận máy hỏng.",
    notice: null,
    results: [
      {
        evidenceId: "evidence-1",
        tool: "get_factory_summary",
        source: "database",
        queriedAt: time,
        partial: true,
        truncated: true,
        counts: {
          inspected: 2,
          gatewayOnline: 1,
          offline: 1,
          stale: 1,
          overheat: 0,
          underheat: 0,
          normal: 0,
          unknown: 2,
        },
        errors: [
          { deviceId: "CNC-02", message: "Không lấy được lịch sử CNC-02." },
        ],
        devices: [
          {
            deviceId: "BENCH/01?zone=A",
            name: "Bench fixture",
            gatewayOnline: false,
            dataFresh: false,
            priority: "high",
            provenance: "simulation",
            failureConfirmed: false,
            readHealth: "unknown",
            deliveryHealth: "stale",
            reasons: ["Gateway không gửi heartbeat."],
            nextChecks: ["Kiểm tra nguồn gateway và Wi-Fi."],
            temperatures: [],
            metrics: [
              {
                key: "rpm",
                value: 1534,
                unit: "rpm",
                measuredAt: time,
                readSuccess: true,
              },
            ],
          },
        ],
        series: [
          {
            deviceId: "BENCH/01?zone=A",
            metricKey: "temperature",
            unit: "unverified",
            unitVerified: false,
            samplingIntervalMs: null,
            points: [],
            sampledCount: 0,
            min: null,
            max: null,
            change: null,
            coverage: {
              from: Date.parse(time) - 3600000,
              to: Date.parse(time),
              firstSampleAt: null,
              lastSampleAt: null,
            },
          },
        ],
      },
    ],
    report: {
      version: 1,
      status: "partial",
      generatedAt: time,
      view: "workspace",
      failureConfirmed: false,
      findings: [
        {
          title: "Kiểm tra kết nối trước",
          explanation: "Một gateway mất kết nối trong phạm vi truy vấn.",
          evidenceIds: ["evidence-1"],
          nextCheck: "Đối chiếu nguồn và Wi-Fi.",
        },
      ],
      followUp: "Xem lịch sử cảnh báo của gateway này?",
      limitations: ["Chưa có bằng chứng xác nhận lỗi cơ khí."],
      evidence: [
        { id: "evidence-1", tool: "get_factory_summary", queriedAt: time },
      ],
      trace: [
        {
          tool: "get_factory_summary",
          round: 1,
          status: "success",
          durationMs: 25,
        },
        {
          tool: "get_telemetry",
          round: 2,
          status: "error",
          durationMs: 5000,
          error: "Truy vấn lịch sử hết thời gian chờ.",
        },
      ],
    },
  };
}
function mount(answer = response(), onNavigate = vi.fn()) {
  return {
    ...render(
      <MemoryRouter>
        <InvestigationView answer={answer} onNavigate={onNavigate} />
      </MemoryRouter>,
    ),
    onNavigate,
  };
}
afterEach(() => {
  act(() => setLanguage("vi"));
  localStorage.clear();
});

it("shows backend facts, partial retrieval and next checks without turning offline into confirmed failure", () => {
  const answer = copilotSchema.parse(response());
  mount(answer);
  expect(screen.getByText("Nguồn mô phỏng")).toBeVisible();
  expect(screen.getByText("Gateway không gửi heartbeat.")).toBeVisible();
  expect(screen.getByText("Kiểm tra nguồn gateway và Wi-Fi.")).toBeVisible();
  expect(screen.getByText(/Không lấy được lịch sử CNC-02/)).toBeVisible();
  expect(
    screen.getByText(/Một phần dữ liệu chưa truy xuất được/),
  ).toBeVisible();
  expect(screen.getByText(/Kết quả giới hạn/)).toBeVisible();
  expect(
    screen.getByText(/Xem lịch sử cảnh báo của gateway này/),
  ).toBeVisible();
  const inspected = screen.getByText("Đã kiểm tra").parentElement!;
  expect(within(inspected).getByText("2")).toBeVisible();
  const offline = screen.getByText("Mất kết nối").parentElement!;
  expect(within(offline).getByText("1")).toBeVisible();
  expect(
    screen.getByText(/Mất kết nối hoặc cảnh báo không xác nhận máy hỏng/),
  ).toBeVisible();
  expect(screen.getByText(/1\.534 rpm/)).toBeVisible();
});

it("links findings to their actual evidence and safely opens device details", () => {
  const { container, onNavigate } = mount();
  const evidenceLink = within(
    screen.getByRole("region", { name: "Phân tích có bằng chứng" }),
  ).getByRole("link", { name: "evidence-1" });
  const target = evidenceLink.getAttribute("href")!.slice(1);
  expect(container.querySelectorAll("[id]")).toContainEqual(
    document.getElementById(target),
  );
  expect(document.getElementById(target)).toHaveTextContent(
    "Tình trạng nhà máy",
  );
  const deviceLink = screen.getByRole("link", {
    name: "Bench fixture · BENCH/01?zone=A",
  });
  expect(deviceLink).toHaveAttribute("href", "/machines/BENCH%2F01%3Fzone%3DA");
  fireEvent.click(deviceLink);
  expect(onNavigate).toHaveBeenCalledOnce();
});

it("shows missing chart samples and unverified historical units instead of inventing a trend", () => {
  const answer = copilotSchema.parse(response());
  expect(answer.results[0].series![0].samplingIntervalMs).toBeNull();
  mount(answer);
  expect(
    screen.getByText(
      "Không có mẫu trong khoảng yêu cầu. Chưa thể vẽ xu hướng.",
    ),
  ).toBeVisible();
  const table = screen.getByRole("table");
  expect(within(table).getByText("Chưa xác minh")).toBeVisible();
  expect(
    screen.queryByRole("img", { name: /temperature/ }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByText(/Không xếp hạng nhiệt độ giữa các chuỗi này/),
  ).toBeVisible();
  fireEvent.click(screen.getByText(/Nguồn dữ liệu và công cụ đã dùng/));
  expect(screen.getByText("Truy vấn lịch sử hết thời gian chờ.")).toBeVisible();
});

it.each(["finding", "result", "duplicate"])(
  "rejects %s evidence that cannot be traced to this response",
  (variant) => {
    const answer = response();
    if (variant === "finding")
      answer.report!.findings[0].evidenceIds = ["fabricated-evidence"];
    if (variant === "result")
      answer.results[0].evidenceId = "fabricated-evidence";
    if (variant === "duplicate")
      answer.report!.evidence.push({ ...answer.report!.evidence[0] });
    expect(copilotSchema.safeParse(answer).success).toBe(false);
  },
);

it.each(["report", "device"])(
  "rejects unsupported confirmed failure in %s",
  (scope) => {
    const answer = response();
    const invalid =
      scope === "report"
        ? { ...answer, report: { ...answer.report, failureConfirmed: true } }
        : {
            ...answer,
            results: [
              {
                ...answer.results[0],
                devices: [
                  { ...answer.results[0].devices![0], failureConfirmed: true },
                ],
              },
            ],
          };
    expect(copilotSchema.safeParse(invalid).success).toBe(false);
  },
);

it("switches investigation labels to English while keeping device identifiers and backend evidence intact", () => {
  act(() => setLanguage("en"));
  mount();
  expect(screen.getByText("Simulation source")).toBeVisible();
  expect(
    screen.getByRole("link", { name: "Bench fixture · BENCH/01?zone=A" }),
  ).toBeVisible();
  expect(
    screen.getByText(
      "No samples in the requested range. A trend cannot be plotted.",
    ),
  ).toBeVisible();
  expect(screen.getByText("Gateway không gửi heartbeat.")).toBeVisible();
});

it("rejects orphan evidence or mismatched tool metadata", () => {
  const orphan = response();
  orphan.report!.evidence.push({
    id: "orphan",
    tool: "get_device_status",
    queriedAt: time,
  });
  expect(copilotSchema.safeParse(orphan).success).toBe(false);
  const mismatch = response();
  mismatch.report!.evidence[0].tool = "get_device_status";
  expect(copilotSchema.safeParse(mismatch).success).toBe(false);
});

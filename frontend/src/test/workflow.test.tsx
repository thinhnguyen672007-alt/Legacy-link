import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { canApply, operationSchema, type Telemetry } from "../api/schema";
import { OperationResult } from "../pages/Commissioning";
import { chartPoints } from "../pages/MachineDetail";
import { ApiError } from "../api/client";
import { polling } from "../session";
import { stamp } from "../components/ui";
import { config, operation } from "./fixtures";
const gateway = { gatewayId: "ABCDEF123456", bootId: "boot-1", online: true };
it("formats operational timestamps in GMT+7 rather than the computer timezone", () => {
  expect(stamp("2026-10-10T00:00:00Z")).toContain("07:00:00");
});
describe("Commissioning gates", () => {
  it.each([
    [2, 65534, /Thiết bị từ chối địa chỉ hoặc số thanh ghi/],
    [226, 5, /Không nhận đủ phản hồi trong thời gian chờ/],
    [99, 5, /Chưa có mô tả cho mã lỗi này/],
  ])(
    "explains failed read code %s with metric, address and recovery",
    (errorCode, address, explanation) => {
      render(
        <OperationResult
          op={operation({
            readings: [
              { key: "temperature", address, success: false, errorCode },
            ],
          })}
        />,
      );
      expect(
        screen.getByText(
          new RegExp(
            `Không đọc được temperature tại địa chỉ thô ${address} \\(mã Modbus ${errorCode}\\)`,
          ),
        ),
      ).toHaveTextContent(explanation);
      expect(screen.queryByText(/HTTP 202/)).not.toBeInTheDocument();
    },
  );
  it("does not accept HTTP 202 sent state as completion", () => {
    expect(
      canApply(operation({ phase: "sent" }), config, gateway, Date.now()),
    ).toBe(false);
  });
  it("requires same config, fresh probe and current boot", () => {
    const p = operation();
    expect(canApply(p, config, gateway, Date.now())).toBe(true);
    expect(canApply(p, { ...config, slaveId: 2 }, gateway, Date.now())).toBe(
      false,
    );
    expect(
      canApply(p, config, { ...gateway, bootId: "new-boot" }, Date.now()),
    ).toBe(false);
    expect(
      canApply(
        p,
        config,
        { ...gateway, gatewayId: "OTHER-GATEWAY" },
        Date.now(),
      ),
    ).toBe(false);
    expect(canApply(p, config, gateway, Date.now() + 60001)).toBe(false);
    expect(canApply(p, config, { ...gateway, online: false }, Date.now())).toBe(
      false,
    );
  });
  it("rejects future-dated evidence and inconsistent successful reading codes", () => {
    const now = Date.now();
    expect(
      canApply(operation({ finishedAt: now + 1000 }), config, gateway, now),
    ).toBe(false);
    expect(
      canApply(
        operation({
          readings: [
            {
              key: "temperature",
              address: 1,
              success: true,
              value: 25,
              errorCode: 2,
            },
          ],
        }),
        config,
        gateway,
        now,
      ),
    ).toBe(false);
    expect(
      canApply(operation({ finishedAt: now - 60000 }), config, gateway, now),
    ).toBe(false);
  });
  it("rejects incomplete/failed read evidence", () => {
    expect(
      canApply(operation({ readings: [] }), config, gateway, Date.now()),
    ).toBe(false);
    expect(
      canApply(
        operation({
          readings: [
            { key: "temperature", address: 1, success: false, errorCode: 2 },
          ],
        }),
        config,
        gateway,
        Date.now(),
      ),
    ).toBe(false);
  });
  it("does not fabricate flash persistence from applied", () => {
    render(
      <OperationResult
        op={operation({ kind: "apply", phase: "applied", persisted: false })}
      />,
    );
    expect(screen.getByText(/chưa lưu được vào flash/)).toBeInTheDocument();
    expect(
      screen.getByText(/Chưa có bằng chứng khôi phục/),
    ).toBeInTheDocument();
  });
  it("shows terminal failure explicitly", () => {
    render(
      <OperationResult
        op={operation({ phase: "rejected", error: "Invalid config" })}
      />,
    );
    expect(screen.getByText("Thiết bị từ chối")).toBeInTheDocument();
    expect(screen.getByText("Invalid config")).toBeInTheDocument();
  });
  it("rejects unexpected operation phase", () => {
    expect(
      operationSchema.safeParse({ ...operation(), phase: "success" }).success,
    ).toBe(false);
  });
});
it("chart keeps negative and zero values and gaps", () => {
  const rows: Telemetry[] = [
    { id: "3", deviceId: "A", timestamp: 10000, metrics: { temperature: 0 } },
    { id: "2", deviceId: "A", timestamp: 2000, metrics: {} },
    { id: "1", deviceId: "A", timestamp: 1000, metrics: { temperature: -18 } },
  ];
  expect(chartPoints(rows, "temperature", 5000)).toEqual([
    { time: 1000, value: -18 },
    { time: 2000, value: null },
    { time: 2001, value: null },
    { time: 10000, value: 0 },
  ]);
});
it("polling stops on auth failures and backs off on 429", () => {
  expect(
    polling(5000)({
      state: {
        error: new ApiError("auth", 401),
        errorUpdatedAt: 1,
        dataUpdatedAt: 0,
      },
    }),
  ).toBe(false);
  expect(
    polling(5000)({
      state: {
        error: new ApiError("rate", 429, 45000),
        errorUpdatedAt: 1,
        dataUpdatedAt: 0,
      },
    }),
  ).toBe(45000);
});

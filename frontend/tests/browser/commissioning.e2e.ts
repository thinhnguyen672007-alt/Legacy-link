import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { sampleMachines, sampleCatalog } from "../../src/samples";
import type { Operation } from "../../src/commissioning-model";
const gatewayId = "643C60A7DBCC";
async function fixture(page: Page, failed = false) {
  const operations = new Map<string, Operation>();
  let restored = false;
  await page.route("http://127.0.0.1:3000/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/machines")
      return route.fulfill({ json: sampleMachines(Date.now()) });
    if (path === "/catalog")
      return route.fulfill({ json: sampleCatalog("sample-cnc-01") });
    if (path === "/gateways")
      return route.fulfill({
        json: [
          {
            gatewayId,
            online: true,
            bootId: "b1",
            deviceId: "BENCH-01",
            configRequestId: "",
            restored: false,
            persisted: true,
          },
        ],
      });
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON();
      const kind = path.endsWith("/probe") ? "probe" : "apply";
      const op: Operation = {
        id: `request-${operations.size + 1}`,
        gatewayId,
        kind,
        phase: kind === "probe" ? "completed" : "applied",
        received: true,
        persisted: kind === "apply",
        applied: kind === "apply",
        startedAt: Date.now(),
        finishedAt: Date.now(),
        readings:
          kind === "probe"
            ? body.config.registerMap.map(
                (r: { key: string; address: number; scale: number }) => ({
                  key: r.key,
                  address: r.address,
                  success: !failed,
                  errorCode: failed ? 2 : 0,
                  sampledAt: Date.now(),
                  rawWords: [1200],
                  rawValue: 1200,
                  value: 1200 * r.scale,
                  withinRange: true,
                }),
              )
            : undefined,
      };
      operations.set(op.id, op);
      return route.fulfill({ json: op, status: 202 });
    }
    const op = operations.get(path.split("/").at(-1)!);
    if (op)
      return route.fulfill({ json: { ...op, restoredAfterRestart: restored } });
    return route.fulfill({ status: 404, json: { error: "Unknown route" } });
  });
  return {
    restore: () => {
      restored = true;
    },
  };
}
test("test draft, invalidate edits, apply and wait for restart evidence", async ({
  page,
}) => {
  const state = await fixture(page);
  await page.goto("/#registers");
  await page.getByRole("button", { name: "Start setup" }).click();
  await page.getByRole("button", { name: "Test read", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Read from ESP32" }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Test read results" }),
  ).toContainText("120");
  await expect(
    page.getByRole("button", { name: "Apply tested configuration" }),
  ).toBeEnabled();
  await page.getByLabel("temperature raw address", { exact: true }).fill("49");
  await expect(
    page.getByRole("heading", { name: "Read from ESP32" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Test read", exact: true }).click();
  await page
    .getByRole("button", { name: "Apply tested configuration" })
    .click();
  await expect(
    page.getByText("Confirmed · saved to flash", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Waiting · restored after restart", { exact: true }),
  ).toBeVisible();
  state.restore();
  await expect(
    page.getByText("Confirmed · restored after restart", { exact: true }),
  ).toBeVisible({ timeout: 6000 });
});
test("selected profile survives closing setup and can switch back to A", async ({ page }) => {
  await fixture(page);
  await page.goto("/#registers");
  await page.getByRole("button", { name: "Start setup" }).click();
  await page.getByLabel("Starting profile").selectOption("B");
  await expect(page.getByLabel("temperature raw address", { exact: true })).toHaveValue("49");
  await page.getByRole("button", { name: "Close setup" }).click();
  await page.getByRole("button", { name: "Start setup" }).click();
  await expect(page.getByLabel("Starting profile")).toHaveValue("B");
  await expect(page.getByLabel("temperature raw address", { exact: true })).toHaveValue("49");
  await page.getByLabel("Starting profile").selectOption("A");
  await expect(page.getByLabel("temperature raw address", { exact: true })).toHaveValue("0");
});
test("a Modbus exception blocks apply and explains the failed register", async ({
  page,
}) => {
  await fixture(page, true);
  await page.goto("/#registers");
  await page.getByRole("button", { name: "Start setup" }).click();
  await page.getByRole("button", { name: "Test read", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Test read results" }),
  ).toContainText("Register address unavailable");
  await expect(
    page.getByRole("button", { name: "Apply tested configuration" }),
  ).toBeDisabled();
});
for (const width of [390, 1440])
  test(`commissioning form is accessible and contained at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    await fixture(page);
    await page.goto("/#registers");
    await page.getByRole("button", { name: "Start setup" }).click();
    await page.getByRole("button", { name: "Test read", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Read from ESP32" }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const audit = await new AxeBuilder({ page })
      .include(".commissioning")
      .analyze();
    expect(audit.violations).toEqual([]);
    await page.evaluate(async () => {
      (document.activeElement as HTMLElement | null)?.blur();
      window.scrollTo(0, 0);
      await document.fonts.ready;
    });
    await page.screenshot({
      path: `../.impeccable/review/commissioning-${width}.png`,
      fullPage: true,
    });
  });

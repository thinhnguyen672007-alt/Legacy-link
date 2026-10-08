import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { sampleCatalog, sampleMachines } from "../../src/samples";
async function liveFixture(page: Page) {
  await page.route("http://127.0.0.1:3000/**", async (route) => {
    const url = new URL(route.request().url());
    const data =
      url.pathname === "/machines"
        ? sampleMachines(Date.now())
        : sampleCatalog(url.searchParams.get("deviceId")!);
    await route.fulfill({ json: data });
  });
}
test("live API maps negative measurements, reads catalog and exports actual JSON", async ({
  page,
}) => {
  await page.route("http://127.0.0.1:3000/**", async (route) => {
    const url = new URL(route.request().url());
    const machines = sampleMachines(Date.now());
    machines[0].metrics!.temperature = -18;
    await route.fulfill({
      json:
        url.pathname === "/machines"
          ? machines
          : sampleCatalog(url.searchParams.get("deviceId")!),
    });
  });
  await page.goto("/");
  await expect(page.getByText("API connected", { exact: true })).toBeVisible();
  await expect(page.locator(".reading-value").first()).toContainText("-18");
  await page.getByLabel("Search machines").fill("03");
  await expect(page.locator(".machine-table tbody tr")).toHaveCount(1);
  await page.getByLabel("Search machines").fill("");
  await page.getByRole("button", { name: "CNC 02 sample-cnc-02" }).click();
  await expect(
    page.getByText("Gateway is offline. These are the last stored readings."),
  ).toBeVisible();
  await page.getByRole("link", { name: "Register maps", exact: true }).click();
  await expect(page.locator(".register-table")).toContainText("40001");
  await expect(
    page.getByText("Gateway is offline. These are the last stored readings."),
  ).toBeVisible();
  await expect(
    page.getByRole("columnheader", { name: "Last stored value" }),
  ).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export JSON" }).click();
  expect((await download).suggestedFilename()).toBe(
    "sample-cnc-02-catalog.json",
  );
});
test("network failure retains last data with explicit unverified state and recovers", async ({
  page,
}) => {
  let fail = false;
  await page.route("http://127.0.0.1:3000/**", async (route) => {
    if (fail) return route.fulfill({ status: 500, body: "failure" });
    const url = new URL(route.request().url());
    await route.fulfill({
      json:
        url.pathname === "/machines"
          ? sampleMachines(Date.now())
          : sampleCatalog(url.searchParams.get("deviceId")!),
    });
  });
  await page.goto("/");
  await expect(page.locator(".machine-table tbody tr")).toHaveCount(3);
  fail = true;
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(page.getByText("Backend connection unavailable.")).toBeVisible();
  await expect(page.locator(".machine-table tbody tr")).toHaveCount(3);
  await expect(page.getByText("Unverified", { exact: true })).toHaveCount(3);
  fail = false;
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(page.getByText("API connected", { exact: true })).toBeVisible();
});
test("sample mode is opt-in, never a network fallback, and live clears sample data", async ({
  page,
}) => {
  await page.route("http://127.0.0.1:3000/**", (route) => route.abort());
  await page.goto("/");
  await expect(page.getByText("Let’s connect your machines")).toBeVisible();
  await expect(page.locator(".machine-table")).toHaveCount(0);
  await page.getByRole("button", { name: "Sample", exact: true }).click();
  await expect(
    page.getByText("Sample workspace", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".machine-table tbody tr")).toHaveCount(3);
  await page.getByRole("button", { name: "Live API", exact: true }).click();
  await expect(page.getByText("Let’s connect your machines")).toBeVisible();
  await expect(page.locator(".machine-table")).toHaveCount(0);
});
test("connection form validates, persists endpoint and polls the new backend", async ({
  page,
}) => {
  await page.route("http://127.0.0.1:3000/**", (route) => route.abort());
  await page.route("http://192.168.1.20:3000/**", async (route) => {
    const url = new URL(route.request().url());
    await route.fulfill({
      json:
        url.pathname === "/machines"
          ? sampleMachines(Date.now())
          : sampleCatalog(url.searchParams.get("deviceId")!),
    });
  });
  await page.goto("/#connection");
  await page.getByLabel("HTTP API URL").fill("mqtt://localhost:1883");
  await page.getByRole("button", { name: "Save & connect" }).click();
  await expect(page.getByRole("alert").last()).toContainText("HTTP or HTTPS");
  await page.getByLabel("HTTP API URL").fill("http://192.168.1.20:3000/");
  await page.getByRole("button", { name: "Save & connect" }).click();
  await expect(page.getByText("API connected", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("HTTP API URL")).toHaveValue(
    "http://192.168.1.20:3000",
  );
});
test("empty response and malformed response stay distinct", async ({
  page,
}) => {
  await page.route("http://127.0.0.1:3000/**", (route) =>
    route.fulfill({ json: [] }),
  );
  await page.goto("/");
  await expect(page.getByText("No machines registered yet")).toBeVisible();
  await page.unrouteAll();
  await page.route("http://127.0.0.1:3000/**", (route) =>
    route.fulfill({ json: { data: [] } }),
  );
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("must be an array");
});
test("pause stops polling until resumed", async ({ page }) => {
  let calls = 0;
  await page.route("http://127.0.0.1:3000/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/machines") calls++;
    await route.fulfill({
      json:
        url.pathname === "/machines"
          ? sampleMachines(Date.now())
          : sampleCatalog(url.searchParams.get("deviceId")!),
    });
  });
  await page.goto("/");
  await expect(page.locator(".machine-table tbody tr")).toHaveCount(3);
  await page.getByLabel("Pause automatic updates").click();
  await expect(
    page.getByText("Automatic updates are paused.", { exact: false }),
  ).toBeVisible();
  await page.waitForTimeout(300);
  const afterPause = calls;
  await page.waitForTimeout(2300);
  expect(calls).toBe(afterPause);
  await page.getByLabel("Resume automatic updates").click();
  await expect.poll(() => calls).toBeGreaterThan(afterPause);
});
for (const viewport of [
  { width: 1440, height: 1050 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 359, height: 912 },
]) {
  test(`responsive and accessible at ${viewport.width}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await liveFixture(page);
    await page.goto("/");
    await expect(page.locator(".reading-value").first()).toContainText("25");
    for (const route of ["overview", "registers", "connection"]) {
      await page.goto(`/#${route}`);
      await expect(page.locator("h1")).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      const audit = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze();
      expect(
        audit.violations.map((v) => ({
          id: v.id,
          nodes: v.nodes.map((n) => n.target),
        })),
      ).toEqual([]);
    }
  });
}

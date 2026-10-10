// Browser E2E with a captured real investigation response; API routing is replayed.
// This verifies rendering/context, not live provider integration (see backend script).
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE ?? "playwright"
);
const answer = JSON.parse(readFileSync(process.argv[2], "utf8"));
assert.ok(
  answer.results.some((r) => r.series?.some((s) => s.points.length)),
  "Capture must include actual chart points",
);
const base = process.env.INVESTIGATION_WEB_URL ?? "http://127.0.0.1:5175";
const user = {
  id: "browser-fixture",
  username: "viewer",
  role: "viewer",
  disabled: false,
  mustChangePassword: false,
};
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? "/usr/bin/chromium",
  headless: true,
  args: ["--no-sandbox"],
});
try {
  for (const [label, width, height] of [
    ["desktop", 1440, 1000],
    ["mobile", 390, 844],
  ]) {
    const page = await browser.newPage({ viewport: { width, height } });
    const errors = [],
      requests = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route("**/api/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (!path.startsWith("/api/")) return route.continue();
      let data = [];
      if (path === "/api/auth/login") data = { token: "fixture-only", user };
      if (path === "/api/auth/me") data = user;
      if (path === "/api/ai/chat" || path === "/api/ai/query") {
        const body = route.request().postDataJSON();
        requests.push(body);
        data = globalThis.structuredClone(answer);
        if (requests.length === 2) {
          data.report.status = "partial";
          data.notice = "Gemini quá thời gian; giữ lại bằng chứng backend.";
        }
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(data),
      });
    });
    await page.goto(base);
    await page.getByLabel("Địa chỉ API").fill(base + "/api");
    await page.getByLabel("Tên đăng nhập").fill("viewer");
    await page.getByLabel("Mật khẩu", { exact: true }).fill("fixture-password");
    await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
    await page.getByRole("button", { name: /Hỏi về máy/ }).click();
    await page.getByLabel("Câu hỏi về thiết bị").fill("Vẽ biểu đồ BENCH-01");
    await page
      .getByRole("button", { name: "Gửi câu hỏi", exact: true })
      .click();
    await page.locator(".investigation-chart-canvas svg").first().waitFor();
    assert.ok(await page.locator(".investigation-expanded").isVisible());
    assert.ok(
      (await page
        .locator(".investigation-chart-canvas .recharts-dot")
        .count()) > 0,
      "Actual samples not plotted",
    );
    assert.equal(requests[0].language, "vi");
    assert.ok(
      await page.evaluate(
        () =>
          globalThis.document.documentElement.scrollWidth <=
          globalThis.innerWidth,
      ),
    );
    await page
      .locator(".investigation-chart-canvas")
      .first()
      .scrollIntoViewIfNeeded();
    await page.screenshot({
      path: `/tmp/legacy-ai-${label}.png`,
      fullPage: true,
    });
    await page
      .getByLabel("Câu hỏi về thiết bị")
      .fill("Máy vừa nhắc cần kiểm tra gì?");
    await page
      .getByRole("button", { name: "Gửi câu hỏi", exact: true })
      .click();
    await page
      .getByText("Gemini quá thời gian; giữ lại bằng chứng backend.", {
        exact: true,
      })
      .waitFor();
    assert.equal(requests[1].conversationId, answer.conversationId);
    assert.equal(await page.locator(".investigation-view").count(), 2);
    await page
      .getByRole("button", { name: "Bắt đầu hội thoại mới", exact: true })
      .click();
    assert.equal(await page.locator(".investigation-view").count(), 0);
    assert.deepEqual(errors, []);
    console.log(
      `PASS ${label}: captured real points, expanded chart, context, partial evidence, reset, no overflow`,
    );
    await page.close();
  }
} finally {
  await browser.close();
}

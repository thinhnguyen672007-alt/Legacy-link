// Real Chromium + disposable accounts API (backend/scripts/accounts-integration.mjs --serve).
// Configure Vite's VITE_API_BASE_URL to the same AUTH_TEST_API; never target live accounts.
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE ?? "playwright"
);
const api = process.env.AUTH_TEST_API;
assert.ok(
  api && new URL(api).hostname === "127.0.0.1",
  "Use a disposable loopback API",
);
const web = process.env.AUTH_TEST_WEB ?? "http://127.0.0.1:5174";
const output = resolve(
  process.env.AUTH_TEST_OUTPUT ?? "/tmp/legacy-auth-transition",
);
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? "/usr/bin/chromium",
  headless: process.env.AUTH_TEST_HEADED !== "1",
});
const results = [];
async function login(page, username, password) {
  await page.getByLabel("Tên đăng nhập", { exact: true }).fill(username);
  await page.getByLabel("Mật khẩu", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
}
async function change(page, current, password) {
  await page.getByLabel("Mật khẩu hiện tại").fill(current);
  await page.getByLabel("Mật khẩu mới", { exact: true }).fill(password);
  await page.getByLabel("Nhập lại mật khẩu mới").fill(password);
  await page.getByRole("button", { name: "Lưu và đăng nhập lại" }).click();
}
async function cleanLogin(page, label) {
  await page.getByRole("heading", { name: "Đăng nhập", exact: true }).waitFor();
  await page.waitForTimeout(1400);
  const dom = await page.evaluate(() => {
    const { document, getComputedStyle, sessionStorage } = globalThis;
    const surface = document.querySelector(".ll-morph-surface");
    return {
      collapsed: surface.classList.contains("collapsed"),
      width: surface.getBoundingClientRect().width,
      windowWidth: document.documentElement.clientWidth,
      cloneCount: document.querySelectorAll(".dashboard-page-outgoing").length,
      viewportCount: document.querySelectorAll(".dashboard-transition-viewport")
        .length,
      staleAnimations: document
        .getAnimations()
        .filter((a) =>
          a.effect?.target?.closest?.(".dashboard-transition-viewport"),
        ).length,
      minHeightCount: document.querySelectorAll(
        '.dashboard-transition-viewport[style*="min-height"]',
      ).length,
      entering: document.querySelectorAll(".ll-login.entering").length,
      heroOpacity: getComputedStyle(document.querySelector(".hero")).opacity,
      cardOpacity: getComputedStyle(document.querySelector(".login-card"))
        .opacity,
      sessionStored: sessionStorage.getItem("legacy-link.account-session.v1") !== null,
    };
  });
  assert.equal(dom.collapsed, false, label);
  assert.equal(dom.width, dom.windowWidth, label);
  for (const key of [
    "cloneCount",
    "viewportCount",
    "staleAnimations",
    "minHeightCount",
    "entering",
  ])
    assert.equal(dom[key], 0, `${label}: ${key}`);
  assert.equal(dom.heroOpacity, "1");
  assert.equal(dom.cardOpacity, "1");
  assert.equal(dom.sessionStored, false);
  assert.equal(
    await page.getByLabel("Tên đăng nhập", { exact: true }).inputValue(),
    "",
  );
  assert.equal(
    await page.getByLabel("Mật khẩu", { exact: true }).inputValue(),
    "",
  );
  await page.screenshot({ path: resolve(output, `${label}.png`) });
  results.push({ label, ...dom });
}
try {
  for (const [label, width, height, reducedMotion] of [
    ["desktop", 1440, 1000, "no-preference"],
    ["mobile", 390, 844, "no-preference"],
    ["reduced", 1440, 1000, "reduce"],
  ]) {
    const page = await browser.newPage({
      viewport: { width, height },
      reducedMotion,
    });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(web);
    await login(page, "owner", "owner-password-123");
    await page.getByRole("link", { name: "Nhân viên", exact: true }).click();
    const employee = `browser-${Date.now()}-${label}`,
      temporary = "temporary-password-123",
      password = "changed-password-123";
    await page.getByLabel("Tên đăng nhập", { exact: true }).fill(employee);
    await page.getByLabel("Mật khẩu tạm").fill(temporary);
    await page
      .getByRole("button", { name: "Tạo tài khoản", exact: true })
      .click();
    await page.getByText("Đã tạo tài khoản.", { exact: false }).waitFor();
    await page.getByRole("button", { name: "Đăng xuất", exact: true }).click();
    await cleanLogin(page, `${label}-normal`);
    await login(page, employee, temporary);
    await page
      .getByRole("heading", { name: "Đổi mật khẩu", exact: true })
      .waitFor();
    const me = page.waitForResponse(
      (r) => r.url() === api + "/auth/me" && r.status() === 200,
    );
    await page.reload();
    await me;
    await page
      .getByRole("heading", { name: "Đổi mật khẩu", exact: true })
      .waitFor();
    await change(page, temporary, password);
    await cleanLogin(page, `${label}-password`);
    await page.reload();
    await cleanLogin(page, `${label}-reload-logged-out`);
    await login(page, employee, password);
    await page.getByRole("link", { name: "Thiết bị", exact: true }).click();
    await page
      .getByRole("heading", { name: "Thiết bị", exact: true })
      .waitFor();
    const restored = page.waitForResponse(
      (r) => r.url() === api + "/auth/me" && r.status() === 200,
    );
    await page.reload();
    await restored;
    await page
      .getByRole("heading", { name: "Thiết bị", exact: true })
      .waitFor();
    if (label === "desktop") {
      await page
        .getByRole("link", { name: "Đổi mật khẩu", exact: true })
        .click();
      await change(page, password, "second-password-123");
      await cleanLogin(page, "desktop-optional-password");
      await login(page, employee, "second-password-123");
      await page.getByRole("link", { name: "Thiết bị", exact: true }).click();
      await page
        .getByRole("heading", { name: "Thiết bị", exact: true })
        .waitFor();
      const admin = await (
        await globalThis.fetch(api + "/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            username: "owner",
            password: "owner-password-123",
          }),
        })
      ).json();
      const headers = {
        Authorization: `Bearer ${admin.token}`,
        "Content-Type": "application/json",
      };
      const users = await (
        await globalThis.fetch(api + "/admin/users", { headers })
      ).json();
      const account = users.find((u) => u.username === employee);
      assert.ok(account);
      const revoke = await globalThis.fetch(
        api + "/admin/users/" + account.id,
        { method: "POST", headers, body: JSON.stringify({ disabled: true }) },
      );
      assert.equal(revoke.status, 200);
      await page
        .getByRole("heading", { name: "Đăng nhập", exact: true })
        .waitFor({ timeout: 35000 });
      await cleanLogin(page, "desktop-expired");
    } else {
      await page.getByRole("link", { name: "Cảnh báo", exact: true }).click();
      await page
        .getByRole("button", { name: "Đăng xuất", exact: true })
        .click();
      await cleanLogin(page, `${label}-navigation-logout`);
    }
    assert.deepEqual(errors, [], `${label}: page errors`);
    await page.close();
  }
  writeFileSync(
    resolve(output, "dom-results.json"),
    JSON.stringify(results, null, 2),
  );
  console.log(
    `PASS ${results.length} clean-login checks, real account creation/password/revocation and reload (${output})`,
  );
} finally {
  await browser.close();
}

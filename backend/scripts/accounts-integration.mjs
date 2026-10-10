import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import http from "node:http";
import pg from "pg";
import { createAccounts } from "../src/auth/accounts.js";
import { accountSecurity } from "../src/auth/security.js";
import { createHttpHandler } from "../src/http/handler.js";
import { createRateLimit } from "../src/http/rate-limit.js";
const name = "legacy-accounts-" + randomUUID().slice(0, 8),
  password = randomUUID();
const docker = (...args) =>
  execFileSync("docker", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
let pool, server;
try {
  docker(
    "run",
    "-d",
    "--name",
    name,
    "-e",
    `POSTGRES_PASSWORD=${password}`,
    "-p",
    "127.0.0.1::5432",
    "postgres:16-alpine",
  );
  const port = docker("port", name, "5432/tcp").split(":").at(-1);
  pool = new pg.Pool({
    host: "127.0.0.1",
    port: Number(port),
    user: "postgres",
    password,
    database: "postgres",
  });
  for (let i = 0; ; i++) {
    try {
      await pool.query("SELECT 1");
      break;
    } catch (e) {
      if (i === 50) throw e;
      await new Promise((r) => setTimeout(r, 200));
    }
  }
  await pool.query(
    "CREATE TABLE schema_migrations(version integer PRIMARY KEY)",
  );
  const migration = readFileSync(
    new URL("../db/migrate-accounts.sql", import.meta.url),
    "utf8",
  );
  await pool.query(migration);
  await pool.query(migration);
  const accounts = createAccounts(pool);
  await accounts.bootstrap("owner", "owner-password-123");
  await assert.rejects(() => accounts.bootstrap("other", "owner-password-123"));
  const settings = {
    origins: ["http://localhost:5173", "http://127.0.0.1:5174"],
    readToken: "r".repeat(32),
    writeToken: "w".repeat(32),
  };
  server = http.createServer(
    createHttpHandler({
      accounts,
      security: accountSecurity(settings, accounts),
      rateLimit: createRateLimit({ write: 1000 }),
      listMachines: async () => [],
      previewConfig: async () => ({ ok: true }),
      copilot: async body => ({ mode: "rules", action: body.action }),
    }),
  );
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  if (process.argv.includes("--serve")) {
    console.log(
      `Disposable account test API: ${base}; username owner, password owner-password-123 (test only)`,
    );
    await new Promise((resolve) => {
      process.once("SIGTERM", resolve);
      process.once("SIGINT", resolve);
    });
  } else {
    async function req(path, token = "", body, expected = 200) {
      const res = await fetch(base + path, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const data = await res.json();
      assert.equal(res.status, expected, JSON.stringify(data));
      return data;
    }
    const login = (username, password) =>
      req("/auth/login", "", { username, password });
    await req("/auth/login", "", { username: "owner", password: "wrong" }, 401);
    const owner = await login("owner", "owner-password-123");
    const viewer = await req("/admin/users/create", owner.token, {
      username: "viewer",
      password: "temporary-password",
      role: "viewer",
    });
    await req(
      "/admin/users/create",
      owner.token,
      { username: "VIEWER", password: "temporary-password", role: "viewer" },
      409,
    );
    let v = await login("viewer", "temporary-password");
    await req("/machines", v.token, undefined, 403);
    await req("/auth/password", v.token, {
      currentPassword: "temporary-password",
      password: "viewer-password-123",
    });
    await req("/auth/me", v.token, undefined, 401);
    v = await login("viewer", "viewer-password-123");
    await req("/machines", v.token);
    assert.equal((await req("/ai/query", v.token, { action: "underheat" })).mode, "rules");
    await req("/ai/execute", v.token, {}, 403);
    await req("/config/preview", v.token, { config: {} }, 403);
    await req("/admin/users", v.token, undefined, 403);
    await req("/admin/users", settings.writeToken, undefined, 401);
    await req("/admin/users/" + viewer.id, owner.token, { role: "technician" });
    await req("/auth/me", v.token, undefined, 401);
    const tech = await login("viewer", "viewer-password-123");
    await req("/config/preview", tech.token, { config: {} });
    await req(
      "/admin/users/create",
      tech.token,
      { username: "bad", password: "temporary-password", role: "viewer" },
      403,
    );
    await req("/admin/users/" + viewer.id, owner.token, { disabled: true });
    await req("/auth/me", tech.token, undefined, 401);
    await req(
      "/auth/login",
      "",
      { username: "viewer", password: "viewer-password-123" },
      401,
    );
    await req("/admin/users/" + viewer.id, owner.token, {
      disabled: false,
      password: "reset-password-123",
    });
    const reset = await login("viewer", "reset-password-123");
    assert.equal(reset.user.mustChangePassword, true);
    await req(
      "/admin/users/" + owner.user.id,
      owner.token,
      { disabled: true },
      409,
    );
    await req(
      "/admin/users/" + owner.user.id,
      owner.token,
      { role: "viewer" },
      409,
    );
    const audit = await req("/admin/audit", owner.token);
    assert.ok(
      audit.some(
        (x) => x.action === "request" && x.target === "/config/preview",
      ),
    );
    assert.ok(!JSON.stringify(audit).includes("password-123"));
    await req("/auth/logout", owner.token, {});
    await req("/auth/me", owner.token, undefined, 401);
    const expired = await login("owner", "owner-password-123");
    await pool.query(
      "UPDATE app_session SET expires_at=now()-interval '1 second'",
    );
    await req("/auth/me", expired.token, undefined, 401);
    const hashes = (await pool.query("SELECT password_hash FROM app_user"))
      .rows;
    assert.ok(hashes.every((x) => !x.password_hash.includes("password")));
    console.log(
      "PASS: migration replay, bootstrap, login, first password change, roles, legacy-token admin denial, revoke, disable, reset, last-admin protection, audit, logout and expiry.",
    );
  }
} finally {
  if (server) await new Promise((r) => server.close(r));
  if (pool) await pool.end();
  try {
    docker("rm", "-f", name);
  } catch {}
}

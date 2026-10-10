// Read-only acceptance: uses the running HTTP API/database and real Gemini.
// Supply a local .env path; secrets and provider error messages are never printed.
import { readFileSync, writeFileSync } from "node:fs";
import { parseEnv } from "node:util";
import assert from "node:assert/strict";
import { createTools } from "../src/ai/tools.js";
import { createGemini } from "../src/ai/gemini.js";
import { createCopilot } from "../src/ai/service.js";
const env = parseEnv(readFileSync(process.argv[2], "utf8"));
const base = process.env.INVESTIGATION_API_URL ?? "http://localhost:8080/api";
const headers = {
  Authorization: `Bearer ${env.API_READ_TOKEN}`,
  "Content-Type": "application/json",
};
async function get(path, params = {}) {
  const url = new URL(base + path);
  for (const [key, value] of Object.entries(params))
    if (value != null)
      url.searchParams.set(
        key,
        key === "cursor"
          ? Buffer.from(JSON.stringify(value)).toString("base64url")
          : String(value),
      );
  const response = await fetch(url, {
    headers,
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok)
    throw Object.assign(new Error("Read API failed"), {
      status: response.status,
    });
  return response.json();
}
const provider = createGemini(env);
const model =
  provider &&
  (async (request) => {
    try {
      return await provider(request);
    } catch (error) {
      console.log(
        JSON.stringify({
          providerError: true,
          stage: request.finalize ? "synthesis" : "tool-selection",
          status: error.status ?? null,
          name: error.name,
        }),
      );
      throw error;
    }
  });
const copilot = process.argv.includes("--deployed")
  ? async (body) => {
      const response = await fetch(base + "/ai/chat", {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(60000),
      });
      assert.equal(response.status, 200);
      return response.json();
    }
  : createCopilot({
      runTool: createTools({
        listMachines: () => get("/machines"),
        getMachine: (id) => get("/machines/" + id),
        getCatalog: (id) => get("/catalog", { deviceId: id }),
        telemetryHistory: (id, p) => get("/machines/" + id + "/telemetry", p),
        listAlarms: (p) => get("/alarms", p),
      }),
      model,
    });
const checks = process.argv.includes("--chart")
  ? [
      {
        question:
          "Cho tôi xem biểu đồ nhiệt độ của BENCH-01 trong 60 phút qua.",
      },
    ]
  : process.argv.includes("--single")
    ? [
        {
          question:
            "Bên xưởng có con nào cần ghé kiểm tra ngay không, hay chỉ là mất mạng?",
        },
      ]
    : [
        {
          question:
            "Nhà máy của tôi đang gặp vấn đề gì và tôi nên chú ý điều gì trước?",
        },
        { question: "So sánh nhiệt độ các máy trong một giờ qua." },
        { question: "Tại sao BENCH-01 đang cảnh báo?" },
        {
          question: "Cho tôi xem biểu đồ của máy vừa nhắc đến.",
          followUp: true,
        },
        {
          question:
            "Bên xưởng có con nào cần ghé kiểm tra ngay không, hay chỉ là mất mạng?",
        },
      ];
const results = [];
let previous;
try {
  assert.equal(
    (
      await fetch(base + "/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "summary" }),
      })
    ).status,
    401,
  );
  for (const check of checks) {
    const start = Date.now();
    const answer = await copilot(
      {
        question: check.question,
        language: "vi",
        ...(check.followUp ? { conversationId: previous.conversationId } : {}),
      },
      "live-read-acceptance",
    );
    previous = answer;
    assert.equal(answer.mode, "gemini");
    assert.ok(answer.results.length > 0, "No backend evidence");
    assert.notEqual(answer.report.status, "unavailable");
    assert.equal(answer.report.failureConfirmed, false);
    assert.ok(
      answer.report.findings.every((f) =>
        f.evidenceIds.every((id) =>
          answer.report.evidence.some((e) => e.id === id),
        ),
      ),
    );
    if (check.followUp || check.question.startsWith("So sánh"))
      assert.ok(
        answer.results.some((r) => r.series?.length),
        "Missing requested chart data",
      );
    const info = {
      question: check.question,
      status: answer.report.status,
      tools: answer.results.map((r) => r.tool),
      points: answer.results.reduce(
        (n, r) => n + (r.series ?? []).reduce((n, s) => n + s.points.length, 0),
        0,
      ),
      findings: answer.report.findings.length,
      elapsedMs: Date.now() - start,
    };
    results.push(info);
    console.log(JSON.stringify(info));
    if (process.env.INVESTIGATION_EVIDENCE_PATH)
      writeFileSync(
        process.env.INVESTIGATION_EVIDENCE_PATH,
        JSON.stringify(answer, null, 2),
      );
  }
  console.log(
    JSON.stringify({
      ok: true,
      realGemini: true,
      realRunningDatabase: true,
      checks: results.length,
      unauthorizedBlocked: true,
    }),
  );
} catch (error) {
  console.log(
    JSON.stringify({
      ok: false,
      status: error.status ?? null,
      name: error.name,
      checksCompleted: results.length,
    }),
  );
  process.exitCode = 1;
}

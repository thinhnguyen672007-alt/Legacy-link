import test from "node:test";
import assert from "node:assert/strict";
import { createGemini } from "./gemini.js";
test("SDK chính thức: gửi đúng declarations, giới hạn token, nhận function call; không gửi telemetry/key trong prompt", async () => {
  const old = globalThis.fetch;
  let request;
  globalThis.fetch = async (url, options) => {
    request = { url: String(url), body: JSON.parse(options.body) };
    return new Response(
      JSON.stringify({
        candidates: [
          {
            content: {
              role: "model",
              parts: [
                {
                  functionCall: {
                    name: "get_devices_by_temperature_status",
                    args: { status: "underheat" },
                  },
                },
              ],
            },
            finishReason: "STOP",
          },
        ],
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };
  try {
    const model = createGemini({
      GEMINI_API_KEY: "fake-test-key",
      GEMINI_MODEL: "configured-test-model",
    });
    const result = await model("Máy nào underheat?", ["BENCH-01"]);
    assert.equal(result.calls[0].name, "get_devices_by_temperature_status");
    assert.equal(result.calls[0].args.status, "underheat");
    assert.match(request.url, /configured-test-model/);
    assert.equal(request.body.generationConfig.maxOutputTokens, 512);
    assert.equal(request.body.tools[0].functionDeclarations.length, 5);
    assert.equal(JSON.stringify(request.body).includes("fake-test-key"), false);
    assert.equal(
      JSON.stringify(request.body).includes("telemetryHistory"),
      false,
    );
    assert.equal(createGemini({}), null);
    assert.throws(() => createGemini({ GEMINI_API_KEY: "fake-test-key" }));
  } finally {
    globalThis.fetch = old;
  }
});

test("SDK nhận 429 chỉ gửi một request, không tự retry làm tiêu quota", async () => {
  const old = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return new Response(
      JSON.stringify({
        error: {
          code: 429,
          message: "Quota exhausted",
          status: "RESOURCE_EXHAUSTED",
        },
      }),
      { status: 429, headers: { "content-type": "application/json" } },
    );
  };
  try {
    await assert.rejects(
      createGemini({
        GEMINI_API_KEY: "fake-test-key",
        GEMINI_MODEL: "configured-test-model",
      })("Tóm tắt nhà máy", []),
    );
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = old;
  }
});

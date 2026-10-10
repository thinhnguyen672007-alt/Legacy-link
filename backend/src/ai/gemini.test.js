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
    const result = await model({
      contents: [
        {
          role: "user",
          parts: [
            {
              text: JSON.stringify({
                question: "Máy nào underheat?",
                context: ["BENCH-01"],
              }),
            },
          ],
        },
      ],
      signal: AbortSignal.timeout(12000),
    });
    assert.equal(result.calls[0].name, "get_devices_by_temperature_status");
    assert.equal(result.calls[0].args.status, "underheat");
    assert.match(request.url, /configured-test-model/);
    assert.equal(request.body.generationConfig.maxOutputTokens, 2200);
    assert.equal(request.body.tools[0].functionDeclarations.length, 8);
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
      })({
        contents: [{ role: "user", parts: [{ text: "Tóm tắt nhà máy" }] }],
        signal: AbortSignal.timeout(12000),
      }),
    );
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = old;
  }
});

test("SDK preserves model thought signatures and sends function results, validates final JSON transport", async () => {
  const old = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (_, options) => {
    requests.push(JSON.parse(options.body));
    const content =
      requests.length === 1
        ? {
            role: "model",
            parts: [
              {
                thoughtSignature: "opaque-signature",
                functionCall: { name: "get_factory_summary", args: {} },
              },
            ],
          }
        : {
            role: "model",
            parts: [
              {
                text: JSON.stringify({
                  summary: "Đã đọc",
                  findings: [],
                  followUp: "",
                  view: "brief",
                }),
              },
            ],
          };
    return new Response(
      JSON.stringify({ candidates: [{ content, finishReason: "STOP" }] }),
      { headers: { "content-type": "application/json" } },
    );
  };
  try {
    const model = createGemini({
      GEMINI_API_KEY: "fixture-only-key",
      GEMINI_MODEL: "test-model",
    });
    const contents = [
      { role: "user", parts: [{ text: "Nhà máy có vấn đề gì?" }] },
    ];
    const first = await model({ contents, signal: AbortSignal.timeout(1000) });
    contents.push(first.content, {
      role: "user",
      parts: [
        {
          functionResponse: {
            name: "get_factory_summary",
            response: { source: "database", counts: { inspected: 1 } },
          },
        },
      ],
    });
    const final = await model({
      contents,
      finalize: true,
      signal: AbortSignal.timeout(1000),
    });
    assert.equal(
      requests[1].contents[1].parts[0].thoughtSignature,
      "opaque-signature",
    );
    assert.equal(
      requests[1].contents[2].parts[0].functionResponse.response.source,
      "database",
    );
    assert.equal(
      requests[1].generationConfig.responseMimeType,
      "application/json",
    );
    assert.equal(final.analysis.summary, "Đã đọc");
  } finally {
    globalThis.fetch = old;
  }
});

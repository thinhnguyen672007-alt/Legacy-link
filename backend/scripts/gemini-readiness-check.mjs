import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { createGemini } from "../src/ai/gemini.js";
const env = parseEnv(readFileSync(process.argv[2], "utf8"));
const model = createGemini(env);
try {
  if (!model) throw new Error("NotConfigured");
  const response = await model({
    contents: [
      {
        role: "user",
        parts: [
          {
            text: "Nhà máy có máy nào cần chú ý? Hãy chọn công cụ lấy dữ liệu, chưa kết luận khi chưa có dữ liệu.",
          },
        ],
      },
    ],
    signal: AbortSignal.timeout(15000),
  });
  console.log(
    JSON.stringify({
      configured: true,
      model: env.GEMINI_MODEL,
      ok: true,
      tools: response.calls.map((call) => call.name),
    }),
  );
} catch (error) {
  // SDK exceptions may include request details. Never print their messages or URLs.
  console.log(
    JSON.stringify({
      configured: !!model,
      model: env.GEMINI_MODEL,
      ok: false,
      status: error.status ?? null,
      name: error.name,
    }),
  );
  process.exitCode = 1;
}

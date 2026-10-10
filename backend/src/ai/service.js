import { randomUUID, createHash } from "node:crypto";
import { validateTool } from "./tools.js";
import { validateAnalysis, validateResult, compactEvidence } from "./report.js";
import { ControlError } from "../control/validation.js";
const fail = (message, status = 400) => {
  throw new ControlError(message, status);
};
const quick = {
  overheat: ["get_devices_by_temperature_status", { status: "overheat" }],
  underheat: ["get_devices_by_temperature_status", { status: "underheat" }],
  offline: ["get_devices_by_temperature_status", { status: "offline" }],
  summary: ["get_factory_summary", {}],
  alerts: ["get_recent_alerts", {}],
};
const safeQuestion = (value) =>
  typeof value === "string" &&
  value.trim() &&
  value.length <= 1000 &&
  !/\b(?:AIza|AQ\.)[\w.-]{20,}\b/.test(value);

export function createCopilot({
  runTool,
  model = null,
  clock = Date.now,
  requestTimeoutMs = 50000,
  modelTimeoutMs = 12000,
  maxModelCallsPerMinute = 24,
}) {
  const sessions = new Map(),
    quota = new Map(),
    busyConversations = new Set();
  let inFlight = 0,
    providerCooldownUntil = 0;
  return async (body, identity = "") => {
    if (
      !body ||
      typeof body !== "object" ||
      Array.isArray(body) ||
      Object.keys(body).some(
        (k) =>
          !["question", "action", "conversationId", "language"].includes(k),
      )
    )
      fail("Tham số không được phép");
    if (body.action !== undefined && !Object.hasOwn(quick, body.action))
      fail("Quick action không hợp lệ");
    if (body.action === undefined && !safeQuestion(body.question))
      fail("Câu hỏi cần 1–1000 ký tự và không chứa API key");
    if (body.action !== undefined && body.question !== undefined)
      fail("Chỉ gửi action hoặc question");
    if (body.language !== undefined && !["vi", "en"].includes(body.language))
      fail("Ngôn ngữ không hợp lệ");
    if (
      body.conversationId !== undefined &&
      (typeof body.conversationId !== "string" ||
        !/^[\da-f-]{36}$/.test(body.conversationId))
    )
      fail("Conversation ID không hợp lệ");
    const now = clock(),
      owner = createHash("sha256").update(identity).digest("hex");
    for (const [id, session] of sessions)
      if (now - session.at > 600000) sessions.delete(id);
    const previous = sessions.get(body.conversationId);
    if (previous && previous.owner !== owner)
      fail("Conversation không thuộc phiên này", 403);
    if (body.conversationId && !previous)
      fail(
        "Hội thoại đã hết hạn. Bắt đầu điều tra mới và nêu lại mã máy.",
        410,
      );
    const conversationId = previous ? body.conversationId : randomUUID();
    if (busyConversations.has(conversationId))
      fail("Hội thoại đang xử lý câu hỏi khác. Vui lòng chờ.", 409);
    const en = body.language === "en";
    const say = (vi, english) => (en ? english : vi);
    const results = [],
      trace = [],
      evidence = [],
      limitations = [];
    let analysis = null,
      notice = null,
      text = "",
      followUp = "",
      mode = body.action ? "rules" : "gemini";
    const deadline = Date.now() + requestTimeoutMs;
    const contents = [
      {
        role: "user",
        parts: [
          {
            text: JSON.stringify({
              question: body.question,
              now: new Date(now).toISOString(),
              context: previous?.turns ?? [],
              previousDeviceIds: previous?.devices ?? [],
              contextIsHistorical: true,
            }),
          },
        ],
      },
    ];
    let counted = false;
    busyConversations.add(conversationId);
    const limited = async (run, milliseconds) => {
      const remaining = Math.min(milliseconds, deadline - Date.now());
      if (remaining <= 0) throw new Error("Investigation deadline");
      let timer;
      try {
        return await Promise.race([
          run(AbortSignal.timeout(remaining)),
          new Promise((_, reject) => {
            timer = setTimeout(
              () => reject(new Error("Investigation timeout")),
              remaining,
            );
          }),
        ]);
      } finally {
        clearTimeout(timer);
      }
    };
    async function callModel(finalize = false) {
      if (clock() < providerCooldownUntil)
        throw Object.assign(new Error("Provider cooldown"), { status: 429 });
      const minute = Math.floor(clock() / 60000);
      if (!quota.has(minute)) quota.clear();
      const used = quota.get(minute) ?? 0;
      if (used >= maxModelCallsPerMinute)
        throw Object.assign(new Error("Model quota"), { status: 429 });
      quota.set(minute, used + 1);
      return limited(
        (signal) =>
          model({ contents, signal, finalize, language: en ? "en" : "vi" }),
        modelTimeoutMs,
      );
    }
    async function execute(call, round) {
      const started = Date.now();
      try {
        const output = validateResult(
          await limited(
            () =>
              runTool(call.name, call.args ?? {}, {
                deadline: Math.min(deadline, Date.now() + 8000),
              }),
            8000,
          ),
          call.name,
        );
        const evidenceId = `e${results.length + 1}`;
        const result = { ...output, evidenceId };
        results.push(result);
        evidence.push({
          id: evidenceId,
          tool: call.name,
          queriedAt: result.queriedAt,
        });
        trace.push({
          tool: call.name,
          round,
          status: "success",
          durationMs: Date.now() - started,
        });
        if (result.truncated || result.partial)
          limitations.push(
            say(
              "Một truy vấn có dữ liệu bị giới hạn hoặc chưa đầy đủ.",
              "A query returned limited or incomplete data.",
            ),
          );
        return {
          functionResponse: {
            ...(call.id ? { id: call.id } : {}),
            name: call.name,
            response: compactEvidence(result),
          },
        };
      } catch (error) {
        const message =
          error.status === 404
            ? say("Không tìm thấy thiết bị.", "Device not found.")
            : say(
                "Không đọc được dữ liệu công cụ. Kiểm tra kết nối hoặc thử lại.",
                "Could not read tool data. Check connectivity or retry.",
              );
        trace.push({
          tool: call.name,
          round,
          status: "error",
          durationMs: Date.now() - started,
          error: message,
        });
        limitations.push(message);
        return {
          functionResponse: {
            ...(call.id ? { id: call.id } : {}),
            name: call.name,
            response: { error: message, status: error.status ?? 503 },
          },
        };
      }
    }
    try {
      if (body.action)
        await execute(
          { name: quick[body.action][0], args: quick[body.action][1] },
          0,
        );
      else if (!model) {
        mode = "rules";
        notice = say(
          "Chưa cấu hình Gemini. Câu hỏi tự nhiên chưa khả dụng; dùng nút kiểm tra nhanh để đọc dữ liệu thật.",
          "Gemini is not configured. Natural language investigation is unavailable; use quick checks for actual data.",
        );
      } else if (inFlight >= 2) {
        notice = say(
          "AI đang xử lý các điều tra khác. Vui lòng thử lại sau.",
          "AI is processing other investigations. Please retry shortly.",
        );
      } else {
        inFlight++;
        counted = true;
        let toolCount = 0;
        const seen = new Set();
        for (let round = 1; round <= 3; round++) {
          const result = await callModel();
          if (
            !Array.isArray(result.calls) ||
            result.calls.length > 4 ||
            toolCount + result.calls.length > 8
          )
            throw new Error("Invalid tool call budget");
          if (!result.calls.length) {
            if (
              !results.length &&
              safeQuestion(result.text) &&
              result.text.length <= 500 &&
              /[?？]$/.test(result.text.trim())
            )
              followUp = result.text.trim();
            break;
          }
          for (const call of result.calls)
            validateTool(call.name, call.args ?? {});
          const content = result.content ?? {
            role: "model",
            parts: result.calls.map((call) => ({ functionCall: call })),
          };
          contents.push(content);
          const responses = [];
          for (const call of result.calls) {
            const key = JSON.stringify([call.name, call.args]);
            if (seen.has(key))
              responses.push({
                functionResponse: {
                  ...(call.id ? { id: call.id } : {}),
                  name: call.name,
                  response: {
                    error: "Already queried this turn; use earlier evidence.",
                  },
                },
              });
            else {
              seen.add(key);
              responses.push(await execute(call, round));
            }
          }
          toolCount += result.calls.length;
          contents.push({ role: "user", parts: responses });
          if (toolCount >= 8) break;
        }
        if (results.length) {
          contents.push({
            role: "user",
            parts: [
              {
                text: "Finish the investigation using the evidence gathered. Return the report schema; cite only existing evidence IDs. Include missing data and unsupported requests.",
              },
            ],
          });
          analysis = validateAnalysis(
            (await callModel(true)).analysis,
            evidence.map((item) => item.id),
          );
          text = analysis.summary;
        }
      }
    } catch (error) {
      if (error.status === 429 && clock() >= providerCooldownUntil)
        providerCooldownUntil = clock() + 60000;
      notice =
        error.status === 429
          ? say(
              "Gemini đã chạm giới hạn lượt gọi. Chờ khoảng 1 phút rồi thử lại; các nút kiểm tra nhanh vẫn dùng được. Bằng chứng đã lấy được vẫn hiển thị bên dưới.",
              "Gemini has reached its request limit. Wait about a minute before retrying; quick checks remain available. Retrieved evidence is retained below.",
            )
          : say(
              "Gemini không khả dụng, quá thời gian hoặc kết quả không hợp lệ. Chỉ hiển thị bằng chứng backend đã đọc được; không thay bằng câu trả lời giả.",
              "Gemini is unavailable, timed out or returned an invalid result. Only retrieved backend evidence is shown; no simulated answer is substituted.",
            );
      limitations.push(notice);
    } finally {
      if (counted) inFlight--;
      busyConversations.delete(conversationId);
    }
    if (!text)
      text = results.length
        ? say(
            "Đã lấy dữ liệu từ backend. Xem trạng thái, mức ưu tiên và bằng chứng bên dưới; chưa xác minh nguyên nhân hỏng hóc.",
            "Backend data retrieved. Review status, priority and evidence below; the cause of failure has not been verified.",
          )
        : say(
            "Chưa có dữ liệu để kết luận. Hãy nêu rõ máy cần kiểm tra hoặc dùng kiểm tra nhanh.",
            "No evidence is available for a conclusion. Specify a device or use a quick check.",
          );
    const devices = [
      ...new Set(
        results.flatMap(
          (result) => result.devices?.map((device) => device.deviceId) ?? [],
        ),
      ),
    ].slice(0, 100);
    const turns = [
      ...(previous?.turns ?? []),
      {
        question: body.question ?? body.action,
        summary: text.slice(0, 1500),
        devices,
      },
    ].slice(-4);
    if (sessions.size >= 50 && !sessions.has(conversationId))
      sessions.delete(sessions.keys().next().value);
    sessions.set(conversationId, {
      owner,
      at: clock(),
      devices: devices.length ? devices : (previous?.devices ?? []),
      turns,
    });
    const status = !results.length
      ? "unavailable"
      : notice ||
          trace.some((item) => item.status === "error") ||
          results.some((r) => r.partial || r.truncated)
        ? "partial"
        : "complete";
    return {
      conversationId,
      mode,
      notice,
      text,
      results,
      report: {
        version: 1,
        status,
        generatedAt: new Date(clock()).toISOString(),
        view: results.some((result) => result.series?.length)
          ? "workspace"
          : (analysis?.view ?? (results.length > 1 ? "workspace" : "brief")),
        findings: analysis?.findings ?? [],
        followUp: analysis?.followUp ?? followUp,
        limitations: [...new Set(limitations)],
        evidence,
        trace,
        failureConfirmed: false,
      },
    };
  };
}

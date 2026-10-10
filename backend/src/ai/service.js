import { randomUUID, createHash } from "node:crypto";
import { validateTool } from "./tools.js";
import { ControlError } from "../control/validation.js";
const safe = (x) =>
  typeof x === "string" && x.length <= 1000 && !/\bAIza[\w-]{20,}\b/.test(x);
const fail = (text, status = 400) => {
  throw new ControlError(text, status);
};
// Bộ nhớ hữu hạn: chỉ giữ ID máy của kết quả trước, không giữ câu hỏi/token/telemetry cũ.
export function createCopilot({ runTool, model = null, clock = Date.now }) {
  const sessions = new Map(),
    quota = new Map();
  let inFlight = 0;
  return async (body, identity = "") => {
    if (!body || typeof body !== "object" || Array.isArray(body))
      fail("Body không hợp lệ");
    if (
      Object.keys(body).some(
        (k) => !["question", "action", "conversationId"].includes(k),
      )
    )
      fail("Tham số không được phép");
    const quick = {
      overheat: ["get_devices_by_temperature_status", { status: "overheat" }],
      underheat: ["get_devices_by_temperature_status", { status: "underheat" }],
      offline: ["get_devices_by_temperature_status", { status: "offline" }],
      summary: ["get_factory_summary", {}],
      alerts: ["get_recent_alerts", {}],
    };
    if (body.action !== undefined && !Object.hasOwn(quick, body.action))
      fail("Quick action không hợp lệ");
    if (
      body.action === undefined &&
      (!safe(body.question) || !body.question.trim())
    )
      fail("Câu hỏi cần 1–1000 ký tự và không chứa API key");
    if (body.action !== undefined && body.question !== undefined)
      fail("Chỉ gửi action hoặc question");
    if (
      body.conversationId !== undefined &&
      (typeof body.conversationId !== "string" ||
        !/^[\da-f-]{36}$/.test(body.conversationId))
    )
      fail("Conversation ID không hợp lệ");
    const now = clock(),
      owner = createHash("sha256").update(identity).digest("hex");
    for (const [id, s] of sessions)
      if (now - s.at > 600000) sessions.delete(id);
    const previous = sessions.get(body.conversationId);
    if (previous && previous.owner !== owner)
      fail("Conversation không thuộc phiên này", 403);
    const context = previous?.devices ?? [];
    const conversationId = previous ? body.conversationId : randomUUID();
    let calls,
      mode = "rules",
      notice = null;
    if (body.action)
      calls = [{ name: quick[body.action][0], args: quick[body.action][1] }];
    else {
      // Chỉ một request model đang chạy; tối đa 5/phút toàn API để bảo vệ free tier dùng chung.
      const minute = Math.floor(now / 60000);
      if (quota.size && !quota.has(minute)) quota.clear();
      const used = quota.get(minute) ?? 0;
      if (model && used < 5 && inFlight === 0) {
        quota.set(minute, used + 1);
        inFlight++;
        try {
          const result = await model(body.question, context);
          calls = result.calls;
          mode = "gemini";
          if (!Array.isArray(calls) || calls.length > 4)
            throw new Error("Invalid tool calls");
          for (const call of calls) validateTool(call.name, call.args ?? {});
          if (!calls.length)
            return {
              conversationId,
              mode,
              text: "Hãy chọn máy cụ thể hoặc dùng nút kiểm tra nhanh. AI hiện chỉ hỗ trợ đọc dữ liệu, không điều khiển máy hay thay đổi cấu hình.",
              notice: null,
              results: [],
            };
        } catch {
          calls = undefined;
          notice =
            "Gemini không khả dụng hoặc phản hồi sai. Đang dùng bộ quy tắc dự phòng.";
        } finally {
          inFlight--;
        }
      } else
        notice = model
          ? "Đang giới hạn lượt Gemini để bảo vệ quota free tier. Dùng bộ quy tắc dự phòng."
          : "Chưa cấu hình Gemini. Dùng bộ quy tắc dự phòng.";
      if (!calls) {
        mode = "rules";
        const text = body.question
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "");
        // Chỉ fallback ý định cơ bản, không giả vờ hiểu mọi yêu cầu tự nhiên.
        if (/\b(tat may|dung may|sua|doi|thay doi|ghi|xoa|bo qua)\b/.test(text))
          return {
            conversationId,
            mode,
            notice,
            text: "AI chỉ đọc dữ liệu. Không điều khiển máy hoặc sửa cấu hình.",
            results: [],
          };
        const id =
          body.question.match(/\b[A-Za-z0-9]+-[A-Za-z0-9_-]+\b/)?.[0] ??
          (/may dau tien/.test(text) ? context[0] : null);
        if (id) calls = [{ name: "get_device_status", args: { deviceId: id } }];
        else if (/underheat|qua lanh|nhiet do thap/.test(text))
          calls = [{ name: quick.underheat[0], args: quick.underheat[1] }];
        else if (/overheat|qua nong/.test(text))
          calls = [{ name: quick.overheat[0], args: quick.overheat[1] }];
        else if (/offline|mat ket noi/.test(text))
          calls = [{ name: quick.offline[0], args: quick.offline[1] }];
        else if (/canh bao/.test(text))
          calls = [{ name: quick.alerts[0], args: {} }];
        else if (/tom tat|nha may|bao nhieu/.test(text))
          calls = [{ name: quick.summary[0], args: {} }];
        else
          return {
            conversationId,
            mode,
            notice,
            text: "Bộ quy tắc chưa hiểu câu này. Chọn kiểm tra nhanh hoặc ghi rõ mã máy, ví dụ BENCH-01.",
            results: [],
          };
      }
    }
    // Kiểm tra toàn bộ calls trước khi thực thi bất kỳ tool nào.
    for (const call of calls) validateTool(call.name, call.args ?? {});
    const results = [],
      deadline = Date.now() + 8000;
    for (const call of calls)
      results.push(await runTool(call.name, call.args ?? {}, { deadline }));
    const devices = [
      ...new Set(
        results.flatMap((r) => r.devices?.map((d) => d.deviceId) ?? []),
      ),
    ].slice(0, 100);
    if (sessions.size >= 200) sessions.delete(sessions.keys().next().value);
    sessions.set(conversationId, { owner, at: clock(), devices });
    return {
      conversationId,
      mode,
      notice,
      text: "Kết quả dưới đây được backend lấy từ database và kiểm tra bằng quy tắc cấu hình. Thời điểm lấy dữ liệu được ghi ở từng kết quả.",
      results,
    };
  };
}

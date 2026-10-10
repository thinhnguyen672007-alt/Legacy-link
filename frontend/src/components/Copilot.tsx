import { useEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Link } from "react-router-dom";
import { useApi } from "../session";
import { stamp } from "./ui";
import type { CopilotResponse } from "../api/schema";
const quick = [
  ["overheat", "Máy quá nóng"],
  ["underheat", "Nhiệt độ thấp"],
  ["offline", "Mất kết nối"],
  ["summary", "Tóm tắt nhà máy"],
  ["alerts", "Cảnh báo gần đây"],
];
const statusLabels = {
  normal: "Trong ngưỡng",
  overheat: "Quá nóng",
  underheat: "Dưới ngưỡng nhiệt",
  offline: "Mất kết nối",
  stale: "Số đo cũ",
  unknown: "Chưa đủ căn cứ",
};
export function Copilot() {
  const api = useApi();
  const [open, setOpen] = useState(false),
    [question, setQuestion] = useState("");
  const [responses, setResponses] = useState<
    { question: string; answer: CopilotResponse }[]
  >([]);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);
  async function send(body: { question?: string; action?: string }) {
    if (pending.current) return;
    if (body.question !== undefined) {
      const trimmed = body.question.trim();
      if (!trimmed) return;
      body = { ...body, question: trimmed };
    }
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true);
    setError("");
    try {
      const answer = await api.copilot(
        { ...body, conversationId: responses.at(-1)?.answer.conversationId },
        controller.signal,
      );
      setResponses((old) => [
        ...old.slice(-9),
        {
          question:
            body.question ??
            quick.find((q) => q[0] === body.action)?.[1] ??
            "Kiểm tra",
          answer,
        },
      ]);
      setQuestion("");
    } catch (err) {
      if (!controller.signal.aborted)
        setError(
          err instanceof Error ? err.message : "Không lấy được dữ liệu.",
        );
    } finally {
      pending.current = null;
      setBusy(false);
    }
  }
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button className="copilot-launch">AI Copilot · Hỏi về máy</button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="copilot-panel">
          <header>
            <Dialog.Title>Legacy-link · AI Copilot</Dialog.Title>
            <Dialog.Close asChild>
              <button aria-label="Đóng Copilot">Đóng</button>
            </Dialog.Close>
          </header>
          <Dialog.Description>
            Đọc số đo và cảnh báo. AI không điều khiển máy hoặc sửa cấu hình.
          </Dialog.Description>
          <div className="copilot-quick">
            {quick.map(([action, label]) => (
              <button
                disabled={busy}
                key={action}
                onClick={() => void send({ action })}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="copilot-note">
            Nút kiểm tra nhanh không cần Gemini. Dữ liệu dưới đây phản ánh thời
            điểm truy vấn, không tự cập nhật.
          </p>
          <div className="copilot-messages" aria-live="polite">
            {!responses.length && (
              <p>Thử hỏi: “Máy nào đang quá nóng?” hoặc “Kiểm tra BENCH-01”.</p>
            )}
            {responses.map(({ question: prompt, answer }, i) => (
              <article key={i}>
                <h3>{prompt}</h3>
                <p>
                  {answer.mode === "gemini"
                    ? "Gemini chọn công cụ · Backend xác minh"
                    : "Bộ quy tắc backend"}
                </p>
                {answer.notice && (
                  <p className="copilot-note">{answer.notice}</p>
                )}
                <p>{answer.text}</p>
                {answer.results.map((r, j) => (
                  <section key={j}>
                    <p>Database · Lấy lúc {stamp(r.queriedAt)}</p>
                    {r.counts && (
                      <p>
                        Đã kiểm tra {r.counts.inspected} máy · Gateway có kết
                        nối: {r.counts.gatewayOnline} · Mất kết nối:{" "}
                        {r.counts.offline} · Dữ liệu cũ: {r.counts.stale}. Máy
                        có số đo quá nóng: {r.counts.overheat}; dưới ngưỡng
                        thấp: {r.counts.underheat}. Một máy nhiều cảm biến có
                        thể thuộc cả hai nhóm.
                      </p>
                    )}
                    {r.truncated && (
                      <p>
                        Đang hiển thị kết quả giới hạn; chưa kiểm tra toàn bộ dữ
                        liệu.
                      </p>
                    )}
                    {r.note && <p className="copilot-note">{r.note}</p>}
                    {r.devices?.length === 0 && (
                      <p>Không có máy phù hợp trong phạm vi đã kiểm tra.</p>
                    )}
                    {r.devices?.map((d) => (
                      <div className="copilot-device" key={d.deviceId}>
                        <Link
                          to={`/machines/${encodeURIComponent(d.deviceId)}`}
                          onClick={() => setOpen(false)}
                        >
                          {d.name} · {d.deviceId}
                        </Link>
                        <p>
                          Gateway{" "}
                          {d.gatewayOnline ? "có kết nối" : "mất kết nối"} ·{" "}
                          {d.dataFresh
                            ? "số đo còn mới"
                            : "số đo cũ hoặc chưa có"}
                        </p>
                        {!d.temperatures.length && (
                          <p>Chưa xác định thanh ghi nhiệt độ từ cấu hình.</p>
                        )}
                        {d.temperatures.map((t) => (
                          <div key={t.metricKey}>
                            <strong>{statusLabels[t.status]}</strong> ·{" "}
                            {t.metricKey}: {t.value ?? "—"} {t.unit}
                            <p>
                              Ngưỡng thấp: {t.low ?? "chưa đặt"} · Ngưỡng cao:{" "}
                              {t.high ?? "chưa đặt"}. Đo lúc:{" "}
                              {t.measuredAt ? stamp(t.measuredAt) : "chưa có"}.
                            </p>
                            {t.reason && <p>{t.reason}</p>}
                          </div>
                        ))}
                      </div>
                    ))}
                    {r.alerts && (
                      <>
                        {!r.alerts.length && (
                          <p>
                            Không có sự kiện cảnh báo trong khoảng đã kiểm tra.
                          </p>
                        )}
                        {r.alerts.map((a) => (
                          <p key={a.id}>
                            {a.deviceId} · {a.code} · {a.value ?? "—"} ·{" "}
                            {stamp(a.timestamp)}
                          </p>
                        ))}
                      </>
                    )}
                    {r.series?.map((s) => (
                      <p key={s.metricKey}>
                        Lịch sử {s.metricKey}: {s.points.length} mẫu; thấp nhất{" "}
                        {s.min ?? "—"}, cao nhất {s.max ?? "—"}, thay đổi{" "}
                        {s.change ?? "—"} {s.unit}. Đây là xu hướng, chưa xác
                        định nguyên nhân.
                      </p>
                    ))}
                  </section>
                ))}
              </article>
            ))}
            {busy && <p role="status">Đang chọn công cụ và đọc dữ liệu…</p>}
            {error && <p role="alert">{error}</p>}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void send({ question });
            }}
          >
            <label htmlFor="copilot-question">Câu hỏi về thiết bị</label>
            <textarea
              id="copilot-question"
              maxLength={1000}
              required
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Máy nào cần kiểm tra?"
            />
            <button disabled={busy || !question.trim()}>Gửi câu hỏi</button>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

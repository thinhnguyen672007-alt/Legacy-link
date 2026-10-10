import { tr, useLanguage } from "../language";
import { lazy, Suspense } from "react";
import { Expand, Minimize2, RotateCcw } from "lucide-react";
const InvestigationView = lazy(() =>
  import("./InvestigationView").then((m) => ({ default: m.InvestigationView })),
);
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
  const language = useLanguage();
  const [expanded, setExpanded] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const copy = (vi: string, en: string) => (language === "vi" ? vi : en);
  const [open, setOpen] = useState(false),
    [question, setQuestion] = useState("");
  const [responses, setResponses] = useState<
    { question: string; action?: string; answer: CopilotResponse }[]
  >([]);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);
  useEffect(() => {
    if (!busy) return;
    const start = Date.now();
    const timer = setInterval(
      () => setElapsed(Math.floor((Date.now() - start) / 1000)),
      1000,
    );
    return () => clearInterval(timer);
  }, [busy]);
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
    setElapsed(0);
    setError("");
    try {
      const answer = await api.copilot(
        {
          ...body,
          language,
          conversationId: responses.at(-1)?.answer.conversationId,
        },
        controller.signal,
      );
      setResponses((old) => [
        ...old.slice(-9),
        {
          question:
            body.question ??
            quick.find((q) => q[0] === body.action)?.[1] ??
            "Kiểm tra",
          action: body.action,
          answer,
        },
      ]);
      setQuestion("");
      if (
        answer.report?.view === "workspace" ||
        answer.results.some((result) => result.series?.length)
      )
        setExpanded(true);
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
        <button className="copilot-launch">
          {tr("AI DENSO · Hỏi về máy")}
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content
          className={`copilot-panel ${expanded ? "investigation-expanded" : ""}`}
        >
          <header>
            <Dialog.Title>Legacy-link · AI DENSO</Dialog.Title>
            <div className="investigation-controls">
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setResponses([]);
                  setError("");
                  setQuestion("");
                }}
                title={copy(
                  "Bắt đầu hội thoại mới",
                  "Start a new conversation",
                )}
                aria-label={copy(
                  "Bắt đầu hội thoại mới",
                  "Start a new conversation",
                )}
              >
                <RotateCcw size={18} />
              </button>
              <button
                type="button"
                onClick={() => setExpanded((value) => !value)}
                title={copy(
                  expanded ? "Thu gọn" : "Mở rộng điều tra",
                  expanded ? "Compact view" : "Expand investigation",
                )}
                aria-label={copy(
                  expanded ? "Thu gọn" : "Mở rộng điều tra",
                  expanded ? "Compact view" : "Expand investigation",
                )}
              >
                {expanded ? <Minimize2 size={18} /> : <Expand size={18} />}
              </button>
              <Dialog.Close asChild>
                <button aria-label={tr("Đóng AI DENSO")}>{tr("Đóng")}</button>
              </Dialog.Close>
            </div>
          </header>
          <Dialog.Description>
            {tr(
              "Đọc số đo và cảnh báo. AI không điều khiển máy hoặc sửa cấu hình.",
            )}
          </Dialog.Description>
          <div className="copilot-quick">
            {quick.map(([action, label]) => (
              <button
                disabled={busy}
                key={action}
                onClick={() => void send({ action })}
              >
                {tr(label)}
              </button>
            ))}
          </div>
          <p className="copilot-note">
            {tr(
              "Nút kiểm tra nhanh không cần Gemini. Dữ liệu dưới đây phản ánh thời điểm truy vấn, không tự cập nhật.",
            )}
          </p>
          <div className="copilot-messages" aria-live="polite">
            {!responses.length && (
              <p>
                {tr(
                  "Thử hỏi: “Máy nào đang quá nóng?” hoặc “Kiểm tra BENCH-01”.",
                )}
              </p>
            )}
            {responses.map(({ question: prompt, action, answer }, i) => (
              <article key={i}>
                <h3>{action ? tr(prompt) : prompt}</h3>
                <p>
                  {answer.mode === "gemini"
                    ? copy(
                        "Gemini phân tích · Backend xác minh",
                        "Gemini analysis · Backend verification",
                      )
                    : tr("Bộ quy tắc backend")}
                </p>
                {answer.notice && !answer.report && (
                  <p className="copilot-note">{tr(answer.notice)}</p>
                )}
                <p>{tr(answer.text)}</p>
                {answer.report ? (
                  <Suspense
                    fallback={
                      <p role="status">
                        {copy("Đang mở báo cáo…", "Opening report…")}
                      </p>
                    }
                  >
                    <InvestigationView
                      answer={answer}
                      onNavigate={() => setOpen(false)}
                    />
                  </Suspense>
                ) : (
                  answer.results.map((r, j) => (
                    <section key={j}>
                      <p>
                        {tr("Database · Lấy lúc ")}
                        {stamp(r.queriedAt)}
                      </p>
                      {r.counts && (
                        <p>
                          {tr("Đã kiểm tra ")}
                          {r.counts.inspected}{" "}
                          {tr(" máy · Gateway có kết nối: ")}
                          {r.counts.gatewayOnline} {tr(" · Mất kết nối:")}{" "}
                          {r.counts.offline} {tr(" · Dữ liệu cũ: ")}
                          {r.counts.stale}
                          {tr(". Máy có số đo quá nóng: ")}
                          {r.counts.overheat}
                          {tr("; dưới ngưỡng thấp: ")}
                          {r.counts.underheat}
                          {tr(
                            ". Một máy nhiều cảm biến có thể thuộc cả hai nhóm.",
                          )}
                        </p>
                      )}
                      {r.truncated && (
                        <p>
                          {tr(
                            "Đang hiển thị kết quả giới hạn; chưa kiểm tra toàn bộ dữ liệu.",
                          )}
                        </p>
                      )}
                      {r.note && <p className="copilot-note">{tr(r.note)}</p>}
                      {r.devices?.length === 0 && (
                        <p>
                          {tr(
                            "Không có máy phù hợp trong phạm vi đã kiểm tra.",
                          )}
                        </p>
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
                            {d.gatewayOnline
                              ? tr("có kết nối")
                              : tr("mất kết nối")}{" "}
                            ·{" "}
                            {d.dataFresh
                              ? tr("số đo còn mới")
                              : tr("số đo cũ hoặc chưa có")}
                          </p>
                          {!d.temperatures.length && (
                            <p>
                              {tr(
                                "Chưa xác định thanh ghi nhiệt độ từ cấu hình.",
                              )}
                            </p>
                          )}
                          {d.temperatures.map((t) => (
                            <div key={t.metricKey}>
                              <strong>{tr(statusLabels[t.status])}</strong> ·{" "}
                              {t.metricKey}: {t.value ?? "—"} {t.unit}
                              <p>
                                {tr("Ngưỡng thấp: ")}
                                {t.low ?? tr("chưa đặt")} {tr(" · Ngưỡng cao:")}{" "}
                                {t.high ?? tr("chưa đặt")}
                                {tr(". Đo lúc:")}{" "}
                                {t.measuredAt
                                  ? stamp(t.measuredAt)
                                  : tr("chưa có")}
                                .
                              </p>
                              {t.reason && <p>{tr(t.reason)}</p>}
                            </div>
                          ))}
                        </div>
                      ))}
                      {r.alerts && (
                        <>
                          {!r.alerts.length && (
                            <p>
                              {tr(
                                "Không có sự kiện cảnh báo trong khoảng đã kiểm tra.",
                              )}
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
                          {tr("Lịch sử ")}
                          {s.metricKey}: {s.points.length}{" "}
                          {tr(" mẫu; thấp nhất")} {s.min ?? "—"}
                          {tr(", cao nhất ")}
                          {s.max ?? "—"}
                          {tr(", thay đổi")} {s.change ?? "—"} {s.unit}
                          {tr(". Đây là xu hướng, chưa xác định nguyên nhân.")}
                        </p>
                      ))}
                    </section>
                  ))
                )}
              </article>
            ))}
            {busy && (
              <p role="status">
                {copy(
                  "Đang truy xuất bằng chứng và phân tích",
                  "Retrieving evidence and analyzing",
                )}{" "}
                · {elapsed}s<br />
                <small>
                  {copy(
                    "Kết quả sẽ gồm nguồn dữ liệu; có thể cần nhiều lượt gọi công cụ.",
                    "Results include data sources; several tool calls may be needed.",
                  )}
                </small>
              </p>
            )}
            {error && <p role="alert">{tr(error)}</p>}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void send({ question });
            }}
          >
            <label htmlFor="copilot-question">
              {tr("Câu hỏi về thiết bị")}
            </label>
            <textarea
              disabled={busy}
              id="copilot-question"
              maxLength={1000}
              required
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder={tr("Máy nào cần kiểm tra?")}
            />
            <button disabled={busy || !question.trim()}>
              {tr("Gửi câu hỏi")}
            </button>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

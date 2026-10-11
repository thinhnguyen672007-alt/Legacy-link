import { tr, useLanguage } from "../language";
import { lazy, Suspense } from "react";
import {
  Bot,
  ChevronUp,
  Expand,
  Minimize2,
  RotateCcw,
  Search,
  MessageCircle,
  Send,
  X,
} from "lucide-react";
const InvestigationView = lazy(() =>
  import("./InvestigationView").then((m) => ({ default: m.InvestigationView })),
);
import { useEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Link } from "react-router-dom";
import { useApi } from "../session";
import { stamp } from "./ui";
import "./copilot.css";
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
  const [historySearch, setHistorySearch] = useState("");
  const [selected, setSelected] = useState<number | null>(null);
  const [concise, setConcise] = useState(true);
  const nextTurn = useRef(0);
  const turnRefs = useRef(new Map<number, HTMLElement>());
  const [elapsed, setElapsed] = useState(0);
  const copy = (vi: string, en: string) => (language === "vi" ? vi : en);
  const [open, setOpen] = useState(false),
    [question, setQuestion] = useState("");
  const [responses, setResponses] = useState<
    {
      id: number;
      at: number;
      question: string;
      action?: string;
      answer: CopilotResponse;
    }[]
  >([]);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);
  useEffect(() => {
    if (selected === null && responses.length)
      turnRefs.current
        .get(responses.at(-1)!.id)
        ?.scrollIntoView?.({ block: "start", behavior: "auto" });
  }, [responses, selected]);
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
        ...old,
        {
          id: ++nextTurn.current,
          at: Date.now(),
          question:
            body.question ??
            quick.find((q) => q[0] === body.action)?.[1] ??
            "Kiểm tra",
          action: body.action,
          answer,
        },
      ]);
      setSelected(null);
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
    <Dialog.Root modal={false} open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button
          className="copilot-launch"
          aria-label={tr("AI DENSO · Hỏi về máy")}
        >
          <span className="ai-orb">
            <Bot size={25} />
          </span>
          <span>
            <strong>AI DENSO</strong>
            <small>{tr("Hỏi về máy...")}</small>
          </span>
          <ChevronUp size={15} />
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Content
          className={`copilot-panel ai-chat ${expanded ? "investigation-expanded" : ""}`}
          onInteractOutside={(event) => event.preventDefault()}
        >
          <header>
            <div className="ai-chat-brand">
              <Bot size={25} />
              <div>
                <Dialog.Title>AI DENSO</Dialog.Title>
                <Dialog.Description>
                  {copy(
                    "Hỏi ngắn gọn về thiết bị và dữ liệu",
                    "Ask about devices and data",
                  )}
                </Dialog.Description>
              </div>
            </div>
            <div className="investigation-controls">
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setResponses([]);
                  setSelected(null);
                  setHistorySearch("");
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
                <button aria-label={tr("Đóng AI DENSO")}>
                  <X size={18} />
                </button>
              </Dialog.Close>
            </div>
          </header>
          <div className="ai-chat-body">
            <aside
              className="ai-chat-history"
              aria-label={copy("Lịch sử câu hỏi", "Question history")}
            >
              <strong>{copy("Lịch sử câu hỏi", "Question history")}</strong>
              <label className="ai-history-search">
                <Search size={14} />
                <input
                  aria-label={copy("Tìm trong lịch sử", "Search history")}
                  placeholder={copy("Tìm trong lịch sử…", "Search history…")}
                  value={historySearch}
                  onChange={(event) => setHistorySearch(event.target.value)}
                />
              </label>
              <nav>
                {responses
                  .filter((turn) =>
                    (turn.action ? tr(turn.question) : turn.question)
                      .toLocaleLowerCase(language)
                      .includes(historySearch.toLocaleLowerCase(language)),
                  )
                  .map((turn) => (
                    <button
                      type="button"
                      key={turn.id}
                      aria-current={selected === turn.id ? "true" : undefined}
                      onClick={() => {
                        // Chọn đúng lượt hỏi–đáp, không đổi conversationId hay ngữ cảnh backend.
                        setSelected(turn.id);
                        turnRefs.current.get(turn.id)?.scrollIntoView?.({
                          block: "start",
                          behavior: "auto",
                        });
                      }}
                    >
                      <MessageCircle size={14} />
                      <span>
                        {turn.action ? tr(turn.question) : turn.question}
                        <small>{stamp(turn.at)}</small>
                      </span>
                    </button>
                  ))}
              </nav>
              {historySearch &&
                !responses.some((turn) =>
                  (turn.action ? tr(turn.question) : turn.question)
                    .toLocaleLowerCase(language)
                    .includes(historySearch.toLocaleLowerCase(language)),
                ) && (
                  <p>
                    {copy("Không tìm thấy câu hỏi.", "No questions found.")}
                  </p>
                )}
            </aside>
            <div className="ai-chat-conversation">
              {!responses.length && (
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
              )}
              {!responses.length && (
                <p className="copilot-note">
                  {tr(
                    "Nút kiểm tra nhanh không cần Gemini. Dữ liệu dưới đây phản ánh thời điểm truy vấn, không tự cập nhật.",
                  )}
                </p>
              )}
              <div className="copilot-messages" aria-live="polite">
                {!responses.length && (
                  <p>
                    {tr(
                      "Thử hỏi: “Máy nào đang quá nóng?” hoặc “Kiểm tra BENCH-01”.",
                    )}
                  </p>
                )}
                {responses.map(({ id, question: prompt, action, answer }) => (
                  <article
                    key={id}
                    className={selected === id ? "ai-turn selected" : "ai-turn"}
                    ref={(node) => {
                      if (node) turnRefs.current.set(id, node);
                      else turnRefs.current.delete(id);
                    }}
                  >
                    <h3 className="ai-user-message">
                      {action ? tr(prompt) : prompt}
                    </h3>
                    <p>
                      {answer.mode === "gemini"
                        ? copy(
                            "Gemini phân tích · Backend xác minh",
                            "Gemini analysis · Backend verification",
                          )
                        : tr("Bộ quy tắc backend")}
                    </p>
                    {answer.notice && (
                      <p className="copilot-note">{tr(answer.notice)}</p>
                    )}
                    {(answer.report?.status === "partial" ||
                      answer.results.some(
                        (result) => result.partial || result.truncated,
                      )) && (
                      <p role="status" className="ai-partial">
                        {copy(
                          "Kết quả chưa đầy đủ; không kết luận phần dữ liệu còn thiếu là bình thường.",
                          "Results are incomplete; missing data cannot be assumed normal.",
                        )}
                      </p>
                    )}
                    <p className="ai-answer-text">{tr(answer.text)}</p>
                    {answer.results[0]?.queriedAt && (
                      <small className="ai-answer-time">
                        {copy("Truy vấn lúc", "Queried at")}{" "}
                        {stamp(answer.results[0].queriedAt)}
                      </small>
                    )}
                    <details
                      className="ai-answer-details"
                      open={!concise || undefined}
                    >
                      <summary>
                        {copy(
                          "Xem dữ liệu và nguồn kiểm chứng",
                          "View data and evidence",
                        )}
                      </summary>
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
                            {r.note && (
                              <p className="copilot-note">{tr(r.note)}</p>
                            )}
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
                                    <strong>
                                      {tr(statusLabels[t.status])}
                                    </strong>{" "}
                                    · {t.metricKey}: {t.value ?? "—"} {t.unit}
                                    <p>
                                      {tr("Ngưỡng thấp: ")}
                                      {t.low ?? tr("chưa đặt")}{" "}
                                      {tr(" · Ngưỡng cao:")}{" "}
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
                                {tr(
                                  ". Đây là xu hướng, chưa xác định nguyên nhân.",
                                )}
                              </p>
                            ))}
                          </section>
                        ))
                      )}
                    </details>
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
            </div>
          </div>
          <label className="ai-concise">
            <input
              type="checkbox"
              role="switch"
              checked={concise}
              onChange={(event) => setConcise(event.target.checked)}
            />
            {copy("Trả lời ngắn gọn", "Concise answers")}
          </label>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void send({ question });
            }}
          >
            <label className="sr-only" htmlFor="copilot-question">
              {tr("Câu hỏi về thiết bị")}
            </label>
            <textarea
              disabled={busy}
              id="copilot-question"
              maxLength={1000}
              required
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder={copy(
                "Nhập câu hỏi về thiết bị…",
                "Ask about a device…",
              )}
              rows={1}
              onKeyDown={(event) => {
                if (
                  event.key === "Enter" &&
                  !event.shiftKey &&
                  !event.nativeEvent.isComposing
                ) {
                  event.preventDefault();
                  void send({ question });
                }
              }}
            />
            <button
              aria-label={tr("Gửi câu hỏi")}
              disabled={busy || !question.trim()}
            >
              <Send size={18} />
            </button>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

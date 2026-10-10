import { tr } from "../language";
import { useState } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Settings2 } from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { useApi, polling, useSession } from "../session";
import {
  Badge,
  Empty,
  Notice,
  PageHead,
  QueryState,
  number,
  stamp,
} from "../components/ui";
import { modbusReadError } from "../api/errors";
import type { Machine, Telemetry } from "../api/schema";
export function chartPoints(rows: Telemetry[], metric: string, gap: number) {
  const sorted = [...rows].sort((a, b) => a.timestamp - b.timestamp);
  return sorted.flatMap((row, i) => [
    ...(i > 0 && row.timestamp - sorted[i - 1].timestamp > gap
      ? [{ time: sorted[i - 1].timestamp + 1, value: null }]
      : []),
    { time: row.timestamp, value: row.metrics[metric] ?? null },
  ]);
}
export function MachineDetail() {
  const { id = "" } = useParams();
  return <Detail key={id} id={id} />;
}
function Detail({ id }: { id: string }) {
  const api = useApi();
  const { session } = useSession();
  const q = useQuery({
    queryKey: ["machine", id],
    queryFn: ({ signal }) => api.machine(id, signal),
    refetchInterval: polling(3000),
  });
  const catalog = useQuery({
    queryKey: ["catalog", id],
    queryFn: ({ signal }) => api.catalog(id, signal),
    staleTime: 60000,
  });
  const [tab, setTab] = useState("measure");
  const m = q.data;
  return (
    <>
      <Link className="back" to="/machines">
        <ArrowLeft size={16} />
        {tr("Danh sách thiết bị")}
      </Link>
      <PageHead
        title={m?.name || id}
        description={tr("Mã thiết bị {0} · Thời gian GMT+7", id)}
        action={
          session?.writeToken && (
            <Link
              className="button"
              to={`/commissioning?device=${encodeURIComponent(id)}`}
            >
              <Settings2 size={17} />
              {tr("Cấu hình")}
            </Link>
          )
        }
      />
      <QueryState
        error={q.error}
        loading={q.isPending}
        updated={q.dataUpdatedAt}
      />
      {m && (
        <>
          <div className="status-strip">
            <div>
              <small>{tr("Liên lạc")}</small>
              <Badge value={m.gatewayOnline ? "online" : "offline"} />
            </div>
            <div>
              <small>{tr("Độ mới")}</small>
              <Badge
                value={
                  m.dataFresh === undefined
                    ? "unknown"
                    : m.dataFresh
                      ? "fresh"
                      : "old"
                }
              />
            </div>
            <div>
              <small>{tr("Đọc thiết bị")}</small>
              <Badge value={m.readHealth} />
            </div>
            <div>
              <small>{tr("Gửi dữ liệu")}</small>
              <Badge value={m.deliveryHealth} />
            </div>
          </div>
          <nav className="tabs" aria-label={tr("Nội dung thiết bị")}>
            {[
              ["measure", tr("Số đo")],
              ["history", tr("Lịch sử")],
              ["diagnostics", tr("Chẩn đoán")],
            ].map(([key, label]) => (
              <button
                key={key}
                aria-current={tab === key ? "page" : undefined}
                onClick={() => setTab(key)}
              >
                {label}
              </button>
            ))}
          </nav>
          {tab === "measure" && (
            <div className="surface section">
              <h2>{tr("Số đo gần nhất")}</h2>
              <p className="muted">
                {tr("Đo: ")}
                {stamp(m.lastMeasurementAt)} {tr(" · Nhận:")}{" "}
                {stamp(m.lastTelemetryAt)}
              </p>
              {catalog.error && (
                <Notice>
                  {tr(
                    "Chưa đọc được đơn vị từ catalog. Giá trị được giữ nguyên như API trả về.",
                  )}
                </Notice>
              )}
              {m.metrics && Object.keys(m.metrics).length ? (
                <dl className="readings">
                  {Object.entries(m.metrics).map(([key, v]) => (
                    <div key={key}>
                      <dt>{key}</dt>
                      <dd>
                        {number(v)}{" "}
                        <small>
                          {catalog.data?.registerMap.find((r) => r.key === key)
                            ?.unit ?? tr("chưa rõ đơn vị")}
                        </small>
                      </dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <Empty title={tr("Chưa có số đo")}>
                  {tr("Thiết bị có thể đã đăng ký nhưng chưa gửi dữ liệu.")}
                </Empty>
              )}
              <Notice>
                {tr(
                  "Đơn vị từ catalog hiện tại; mẫu cũ chưa có revision cấu hình để truy nguyên chính xác. Xác minh nếu vừa đổi profile.",
                )}
              </Notice>
              <Link
                className="text-link"
                to={`/alarms?device=${encodeURIComponent(id)}`}
              >
                {tr("Xem cảnh báo của thiết bị →")}
              </Link>
            </div>
          )}
          {tab === "history" && (
            <History id={id} interval={m.samplingIntervalMs ?? 2000} />
          )}
          {tab === "diagnostics" && <Diagnostics m={m} />}
        </>
      )}
    </>
  );
}
function History({ id, interval }: { id: string; interval: number }) {
  const api = useApi();
  const [hours, setHours] = useState("1");
  const [window, setWindow] = useState(() => ({
    from: Date.now() - 3600000,
    to: Date.now(),
  }));
  const [metric, setMetric] = useState("");
  const q = useInfiniteQuery({
    queryKey: ["telemetry", id, window],
    queryFn: ({ signal, pageParam }) =>
      api.telemetry(id, { ...window, limit: 100, cursor: pageParam }, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (p) => p.nextCursor ?? undefined,
  });
  const rows = q.data?.pages.flatMap((p) => p.items) ?? [];
  const keys = [...new Set(rows.flatMap((r) => Object.keys(r.metrics)))];
  const selected = keys.includes(metric) ? metric : (keys[0] ?? "");
  const gap = Math.max(5000, interval * 3);
  return (
    <div className="surface section">
      <div className="toolbar">
        <h2>{tr("Lịch sử số đo")}</h2>
        <label>
          {tr("Khoảng thời gian")}
          <select value={hours} onChange={(e) => setHours(e.target.value)}>
            <option value="1">{tr("1 giờ")}</option>
            <option value="6">{tr("6 giờ")}</option>
            <option value="24">{tr("24 giờ")}</option>
            <option value="168">{tr("7 ngày")}</option>
            <option value="744">{tr("31 ngày")}</option>
          </select>
        </label>
        <button
          onClick={() => {
            const to = Date.now();
            setWindow({ from: to - Number(hours) * 3600000, to });
          }}
        >
          {tr("Đọc khoảng này")}
        </button>
      </div>
      <p className="muted">
        {stamp(window.from)} → {stamp(window.to)}{" "}
        {tr(" · GMT+7. Lịch sử là ảnh chụp tại thời điểm đọc.")}
      </p>
      <QueryState
        error={q.error}
        loading={q.isPending}
        updated={q.dataUpdatedAt}
      />
      {rows.length > 0 ? (
        <>
          <label className="inline-label">
            {tr("Thông số")}
            <select
              value={selected}
              onChange={(e) => setMetric(e.target.value)}
            >
              {keys.map((k) => (
                <option key={k}>{k}</option>
              ))}
            </select>
          </label>
          <p className="help">
            {tr(
              "Giá trị gốc API; đơn vị lịch sử chưa được xác minh theo revision. Ngắt đường khi cách nhau hơn ",
            )}
            {gap / 1000}
            {tr("s, dựa chu kỳ cấu hình hiện tại.")}
          </p>
          <div
            className="chart"
            role="img"
            aria-label={tr(
              "Biểu đồ {0}, {1} mẫu có giá trị; bảng dữ liệu bên dưới.",
              selected,
              rows.filter((r) => r.metrics[selected] != null).length,
            )}
          >
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={chartPoints(rows, selected, gap)}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="time"
                  type="number"
                  domain={["dataMin", "dataMax"]}
                  tickFormatter={(v) =>
                    new Date(v).toLocaleTimeString("vi-VN", {
                      timeZone: "Asia/Ho_Chi_Minh",
                    })
                  }
                />
                <YAxis width={60} domain={["auto", "auto"]} />
                <Tooltip labelFormatter={(v) => stamp(Number(v))} />
                <Line
                  type="linear"
                  dataKey="value"
                  name={selected}
                  stroke="#3446A8"
                  strokeWidth={2}
                  dot={false}
                  connectNulls={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p>
            {rows.length} {tr(" mẫu đã tải trong khoảng chọn.")}{" "}
            {q.hasNextPage
              ? tr("Còn dữ liệu ở trang tiếp theo.")
              : tr("Đã hết dữ liệu trong khoảng này.")}
          </p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{tr("Thời điểm đo (GMT+7)")}</th>
                  <th>{selected}</th>
                  <th>{tr("Backend nhận")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>{stamp(r.timestamp)}</td>
                    <td className="mono">
                      {r.metrics[selected] == null
                        ? tr("Không có phép đo")
                        : number(r.metrics[selected])}
                    </td>
                    <td>{stamp(r.receivedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {q.hasNextPage && (
            <button
              disabled={q.isFetchingNextPage}
              onClick={() => void q.fetchNextPage()}
            >
              {q.isFetchingNextPage ? tr("Đang tải…") : tr("Tải thêm 100 mẫu")}
            </button>
          )}
        </>
      ) : (
        q.data && (
          <Empty title={tr("Không có số đo trong khoảng này")}>
            {tr(
              "Thử mở rộng khoảng thời gian; không có số đo không phải giá trị 0.",
            )}
          </Empty>
        )
      )}
    </div>
  );
}
function Diagnostics({ m }: { m: Machine }) {
  const d = m.diagnostics;
  const delivery = d?.delivery;
  return (
    <div className="surface section">
      <h2>{tr("Chẩn đoán thiết bị")}</h2>
      <p className="muted">
        {tr("Báo cáo lúc ")}
        {stamp(d?.timestamp)} · GMT+7
      </p>
      {!d ? (
        <Empty title={tr("Chưa có báo cáo chẩn đoán")}>
          {tr("Thiết bị chưa gửi diagnostics hoặc firmware chưa hỗ trợ.")}
        </Empty>
      ) : (
        <>
          <Badge value={m.readHealth} />
          <ul className="diagnostic-list">
            {d.readings?.map((r) => (
              <li key={r.key}>
                <span>{r.key}</span>
                <Badge value={r.success ? "healthy" : "read_error"} />
                {!r.success && (
                  <span>
                    {tr("Mã Modbus: ")}
                    {r.errorCode ?? tr("chưa rõ")}.{" "}
                    {r.errorCode == null
                      ? tr("Kiểm tra log gateway để xem nguyên nhân.")
                      : tr(modbusReadError(r.errorCode))}
                  </span>
                )}
              </li>
            ))}
          </ul>
          {delivery ? (
            <>
              <h2>{tr("Hàng đợi gửi dữ liệu")}</h2>
              <Badge value={m.deliveryHealth} />
              <p className="mono muted">Boot: {delivery.bootId}</p>
              {(["telemetry", "alarm"] as const).map((key) => (
                <div className="queue-row" key={key}>
                  <h3>{key === "telemetry" ? tr("Số đo") : tr("Cảnh báo")}</h3>
                  <dl>
                    <div>
                      <dt>{tr("Đang chờ / sức chứa")}</dt>
                      <dd>
                        {delivery[key].pending} / {delivery[key].capacity}
                      </dd>
                    </div>
                    <div>
                      <dt>{tr("Đã nhận xác nhận trong boot")}</dt>
                      <dd>{delivery[key].committed}</dd>
                    </div>
                    <div>
                      <dt>{tr("Không vào được hàng đợi")}</dt>
                      <dd>{delivery[key].failedEnqueues}</dd>
                    </div>
                  </dl>
                  {delivery[key].rejection != null && (
                    <Notice tone="bad">
                      {tr("Backend từ chối mẫu đầu hàng đợi:")}{" "}
                      {JSON.stringify(delivery[key].rejection)}
                    </Notice>
                  )}
                </div>
              ))}
              <Notice>
                {tr(
                  "Hàng đợi nằm trong RAM, có thể mất mẫu khi mất điện. Bộ đếm reset theo boot; “đã nhận xác nhận” không phải tổng bản ghi database. Báo cáo cũ không chứng minh trạng thái hiện tại.",
                )}
              </Notice>
            </>
          ) : (
            <Notice>{tr("Firmware chưa cung cấp thông tin hàng đợi.")}</Notice>
          )}
        </>
      )}
    </div>
  );
}

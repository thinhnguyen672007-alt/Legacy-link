import { tr } from "../language";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { RefreshCw, Check } from "lucide-react";
import { useApi, useSession, polling } from "../session";
import {
  Badge,
  Empty,
  Notice,
  PageHead,
  QueryState,
  number,
  stamp,
} from "../components/ui";
export function Alarms() {
  const api = useApi();
  const { session } = useSession();
  const client = useQueryClient();
  const [params] = useSearchParams();
  const [device, setDevice] = useState(params.get("device") ?? "");
  const [severity, setSeverity] = useState("");
  const [ack, setAck] = useState("false");
  const [days, setDays] = useState("1");
  const [range, setRange] = useState(() => ({
    from: Date.now() - 86400000,
    to: Date.now(),
  }));
  const [cursor, setCursor] = useState<string | undefined>();
  const reset = () => setCursor(undefined);
  const q = useQuery({
    queryKey: ["alarms", device, severity, ack, range, cursor],
    queryFn: ({ signal }) => {
      const to = cursor ? range.to : Date.now();
      return api.alarms(
        {
          ...range,
          from: cursor ? range.from : to - Number(days) * 86400000,
          to,
          deviceId: device || undefined,
          severity: severity || undefined,
          acknowledged: ack || undefined,
          limit: 50,
          cursor,
        },
        signal,
      );
    },
    refetchInterval: cursor ? false : polling(10000),
  });
  const mutation = useMutation({
    mutationFn: api.ack,
    onSuccess: () => void client.invalidateQueries({ queryKey: ["alarms"] }),
  });
  return (
    <>
      <PageHead
        title={tr("Cảnh báo")}
        description={tr(
          "Xác nhận đã xem để đội biết vấn đề nào đã được chú ý.",
        )}
        action={
          <button
            onClick={() => {
              const to = Date.now();
              reset();
              mutation.reset();
              setRange({ from: to - Number(days) * 86400000, to });
            }}
          >
            <RefreshCw size={16} />
            {tr("Đọc đến hiện tại")}
          </button>
        }
      />
      <div className="surface section">
        <div className="filters">
          <label>
            {tr("Mã thiết bị")}
            <input
              value={device}
              placeholder={tr("Tất cả")}
              onChange={(e) => {
                setDevice(e.target.value);
                reset();
              }}
            />
          </label>
          <label>
            {tr("Mức độ")}
            <select
              value={severity}
              onChange={(e) => {
                setSeverity(e.target.value);
                reset();
              }}
            >
              <option value="">{tr("Tất cả")}</option>
              {[
                ["low", tr("Thấp")],
                ["medium", tr("Vừa")],
                ["high", tr("Cao")],
                ["critical", tr("Nghiêm trọng")],
              ].map(([v, t]) => (
                <option value={v} key={v}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <label>
            {tr("Đã xem")}
            <select
              value={ack}
              onChange={(e) => {
                setAck(e.target.value);
                reset();
              }}
            >
              <option value="false">{tr("Chưa xác nhận")}</option>
              <option value="true">{tr("Đã xác nhận")}</option>
              <option value="">{tr("Tất cả")}</option>
            </select>
          </label>
          <label>
            {tr("Khoảng đọc")}
            <select
              value={days}
              onChange={(e) => {
                setDays(e.target.value);
                const to = Date.now();
                setRange({ from: to - Number(e.target.value) * 86400000, to });
                reset();
              }}
            >
              <option value="1">{tr("24 giờ")}</option>
              <option value="7">{tr("7 ngày")}</option>
              <option value="31">{tr("31 ngày")}</option>
            </select>
          </label>
        </div>
        <p className="help">
          {stamp(q.data?.from ?? range.from)} → {stamp(q.data?.to ?? range.to)}{" "}
          {tr(
            "· GMT+7. Trang đầu tự cập nhật mỗi 10 giây; trang sau giữ nguyên khoảng đọc.",
          )}
        </p>
        <QueryState
          error={q.error}
          loading={q.isPending}
          updated={q.dataUpdatedAt}
        />
        {mutation.error && (
          <Notice tone="bad">
            {tr(mutation.error.message)}{" "}
            {tr(
              " Hãy cập nhật lại danh sách để kiểm tra kết quả trước khi thao tác tiếp.",
            )}
          </Notice>
        )}
        {!session?.writeToken && (
          <Notice>
            {tr("Phiên chỉ đọc. Cần quyền Technician để xác nhận cảnh báo.")}
          </Notice>
        )}
        {q.data?.items.length ? (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>{tr("Thiết bị / thời điểm")}</th>
                    <th>{tr("Cảnh báo")}</th>
                    <th>{tr("Mức độ")}</th>
                    <th>{tr("Giá trị API")}</th>
                    <th>{tr("Xác nhận")}</th>
                  </tr>
                </thead>
                <tbody>
                  {q.data.items.map((a) => (
                    <tr key={a.id}>
                      <td>
                        <Link
                          className="device-name"
                          to={`/machines/${encodeURIComponent(a.deviceId)}`}
                        >
                          {a.deviceId}
                        </Link>
                        <small className="subline muted">
                          {stamp(a.timestamp)}
                        </small>
                      </td>
                      <td>
                        {a.code}
                        <small className="subline muted">
                          {a.metricKey ?? tr("Chưa có metric")}
                        </small>
                      </td>
                      <td>
                        <Badge value={a.severity} />
                      </td>
                      <td className="mono">
                        {a.value == null ? tr("Không có") : number(a.value)}
                      </td>
                      <td>
                        {a.acknowledgedAt ? (
                          <span>
                            {tr("Đã xem")}
                            <small className="subline muted">
                              {stamp(a.acknowledgedAt)}
                            </small>
                          </span>
                        ) : (
                          <button
                            disabled={
                              !session?.writeToken || mutation.isPending
                            }
                            onClick={() => mutation.mutate(a.id)}
                          >
                            <Check size={15} />
                            {tr("Đã xem")}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="toolbar pagination">
              <span>
                {q.data.items.length} {tr(" cảnh báo trên trang này")}
              </span>
              {cursor && <button onClick={reset}>{tr("Về trang đầu")}</button>}
              <button
                disabled={!q.data.nextCursor || q.isFetching}
                onClick={() => {
                  if (q.data) {
                    setRange({ from: q.data.from, to: q.data.to });
                    setCursor(q.data.nextCursor ?? undefined);
                  }
                }}
              >
                {tr("Trang tiếp")}
              </button>
            </div>
          </>
        ) : (
          q.data && (
            <Empty title={tr("Không có cảnh báo khớp bộ lọc")}>
              {tr(
                "Không có kết quả không đồng nghĩa thiết bị luôn an toàn; hãy xem thêm trạng thái đọc và độ mới dữ liệu.",
              )}
            </Empty>
          )
        )}
      </div>
      <p className="footnote">
        {tr(
          "Xác nhận là ghi nhận đã xem. Thao tác không điều khiển máy và không xử lý nguyên nhân cảnh báo.",
        )}
      </p>
    </>
  );
}

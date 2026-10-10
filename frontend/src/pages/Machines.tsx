import { tr } from "../language";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ArrowRight, Plus, RefreshCw, Search } from "lucide-react";
import { useApi, polling, useSession } from "../session";
import {
  ApiState,
  Badge,
  Empty,
  PageHead,
  QueryState,
  stamp,
} from "../components/ui";
export function Machines() {
  const api = useApi();
  const { session } = useSession();
  const [search, setSearch] = useState("");
  const [attention, setAttention] = useState(false);
  const q = useQuery({
    queryKey: ["machines"],
    queryFn: ({ signal }) => api.machines(signal),
    refetchInterval: polling(5000),
    refetchIntervalInBackground: false,
  });
  const machines = (q.data ?? []).filter(
    (m) =>
      `${m.deviceId} ${m.name ?? ""}`
        .toLowerCase()
        .includes(search.toLowerCase()) &&
      (!attention ||
        !m.gatewayOnline ||
        !m.dataFresh ||
        m.readHealth !== "healthy" ||
        m.deliveryHealth !== "healthy"),
  );
  return (
    <>
      <PageHead
        title={tr("Thiết bị")}
        description={tr(
          "Quản lý và theo dõi trạng thái kết nối các thiết bị DENSO",
        )}
      />
      <div className="surface">
        <div className="toolbar">
          <label className="search">
            <Search size={17} />
            <input
              aria-label={tr("Tìm thiết bị")}
              placeholder={tr("Tìm tên hoặc mã thiết bị…")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={attention}
              onChange={(e) => setAttention(e.target.checked)}
            />
            {tr("Cần chú ý")}
          </label>
          <button
            className="quiet"
            onClick={() => void q.refetch()}
            disabled={q.isFetching}
          >
            <RefreshCw size={16} />
            {tr("Cập nhật")}
          </button>
          {session?.writeToken && <Link className="button primary configure-device" to="/commissioning"><Plus size={17} />Cấu hình thiết bị</Link>}
        </div>
        <div className="table-meta">
          <span>
            {q.data
              ? tr("{0} thiết bị trong danh sách", machines.length)
              : tr("Danh sách thiết bị")}
          </span>
          <ApiState error={q.error} updated={q.dataUpdatedAt} />
        </div>
        <QueryState
          error={q.error}
          loading={q.isPending}
          updated={q.dataUpdatedAt}
        />
        {!!machines.length && (
          <div className="table-wrap">
            <table className="machine-table">
              <thead>
                <tr>
                  <th>{tr("Thiết bị")}</th>
                  <th>{tr("Liên lạc")}</th>
                  <th>{tr("Số đo")}</th>
                  <th>{tr("Đọc thiết bị")}</th>
                  <th>{tr("Gửi dữ liệu")}</th>
                  <th>
                    {tr("Thao tác")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {machines.map((m) => (
                  <tr key={m.deviceId}>
                    <td data-label={tr("Thiết bị")}>
                      <Link
                        className="device-name"
                        to={`/machines/${encodeURIComponent(m.deviceId)}`}
                      >
                        {m.name || m.deviceId}
                      </Link>
                      <span className="mono muted subline">{m.deviceId}</span>
                    </td>
                    <td data-label={tr("Liên lạc")}>
                      <Badge value={m.gatewayOnline ? "online" : "offline"} />
                    </td>
                    <td data-label={tr("Số đo")}>
                      <Badge
                        value={
                          m.dataFresh === undefined
                            ? "unknown"
                            : m.dataFresh
                              ? "fresh"
                              : "old"
                        }
                      />
                      <small className="subline muted">
                        {stamp(m.lastMeasurementAt)}
                      </small>
                    </td>
                    <td data-label={tr("Đọc thiết bị")}>
                      <Badge value={m.readHealth} />
                    </td>
                    <td data-label={tr("Gửi dữ liệu")}>
                      <Badge value={m.deliveryHealth} />
                    </td>
                    <td>
                      <Link
                        className="icon-link"
                        aria-label={tr("Xem {0}", m.deviceId)}
                        to={`/machines/${encodeURIComponent(m.deviceId)}`}
                      >
                        <ArrowRight size={18} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {q.data && !machines.length && (
          <Empty
            title={
              q.data.length
                ? tr("Không có thiết bị khớp bộ lọc")
                : tr("Chưa có thiết bị")
            }
          >
            {q.data.length
              ? tr("Thử đổi từ khóa hoặc bỏ bộ lọc cần chú ý.")
              : tr("Thêm cấu hình qua gateway đang kết nối để bắt đầu.")}
          </Empty>
        )}
        <div className="surface-footer">
          {tr("Cập nhật gần nhất:")}{" "}
          {q.dataUpdatedAt ? stamp(q.dataUpdatedAt) : tr("Chưa có")} · GMT+7
        </div>
      </div>
      <details className="explanation">
        <summary>{tr("Hiểu trạng thái thiết bị")}</summary>
        <h2>{tr("Liên lạc được chưa có nghĩa là đang đo tốt.")}</h2>
        <p>
          {tr(
            "Xem riêng độ mới của số đo, kết quả đọc và tình trạng gửi dữ liệu. Khi mất kết nối API, dữ liệu gần nhất được giữ lại và có thông báo rõ.",
          )}
        </p>
      </details>
    </>
  );
}

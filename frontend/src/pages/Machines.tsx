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
        title="Thiết bị"
        description="Một góc nhìn rõ ràng về liên lạc, phép đo và dữ liệu đã gửi."
        action={session?.writeToken &&
          <Link className="button primary" to="/commissioning">
            <Plus size={17} />
            Cấu hình thiết bị
          </Link>
        }
      />
      <div className="surface">
        <div className="toolbar">
          <label className="search">
            <Search size={17} />
            <input
              aria-label="Tìm thiết bị"
              placeholder="Tìm tên hoặc mã thiết bị…"
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
            Cần chú ý
          </label>
          <button
            className="quiet"
            onClick={() => void q.refetch()}
            disabled={q.isFetching}
          >
            <RefreshCw size={16} />
            Cập nhật
          </button>
        </div>
        <div className="table-meta">
          <span>
            {q.data
              ? `${machines.length} thiết bị trong danh sách`
              : "Danh sách thiết bị"}
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
                  <th>Thiết bị</th>
                  <th>Liên lạc</th>
                  <th>Số đo</th>
                  <th>Đọc thiết bị</th>
                  <th>Gửi dữ liệu</th>
                  <th>
                    <span className="sr-only">Chi tiết</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {machines.map((m) => (
                  <tr key={m.deviceId}>
                    <td data-label="Thiết bị">
                      <Link
                        className="device-name"
                        to={`/machines/${encodeURIComponent(m.deviceId)}`}
                      >
                        {m.name || m.deviceId}
                      </Link>
                      <span className="mono muted subline">{m.deviceId}</span>
                    </td>
                    <td data-label="Liên lạc">
                      <Badge value={m.gatewayOnline ? "online" : "offline"} />
                    </td>
                    <td data-label="Số đo">
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
                    <td data-label="Đọc thiết bị">
                      <Badge value={m.readHealth} />
                    </td>
                    <td data-label="Gửi dữ liệu">
                      <Badge value={m.deliveryHealth} />
                    </td>
                    <td>
                      <Link
                        className="icon-link"
                        aria-label={`Xem ${m.deviceId}`}
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
                ? "Không có thiết bị khớp bộ lọc"
                : "Chưa có thiết bị"
            }
          >
            {q.data.length
              ? "Thử đổi từ khóa hoặc bỏ bộ lọc cần chú ý."
              : "Thêm cấu hình qua gateway đang kết nối để bắt đầu."}
          </Empty>
        )}
        <div className="surface-footer">
          Cập nhật gần nhất:{" "}
          {q.dataUpdatedAt ? stamp(q.dataUpdatedAt) : "Chưa có"} · GMT+7
        </div>
      </div>
      <div className="explanation">
        <h2>Liên lạc được chưa có nghĩa là đang đo tốt.</h2>
        <p>
          Xem riêng độ mới của số đo, kết quả đọc và tình trạng gửi dữ liệu. Khi
          mất kết nối API, dữ liệu gần nhất được giữ lại và có thông báo rõ.
        </p>
      </div>
    </>
  );
}

import { useId } from "react";
import { Link } from "react-router-dom";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { CopilotResponse } from "../api/schema";
import { locale, tr, useLanguage } from "../language";
import { Badge, number, stamp } from "./ui";
import "./investigation.css";

export function InvestigationView({
  answer,
  onNavigate,
}: {
  answer: CopilotResponse;
  onNavigate?: () => void;
}) {
  const language = useLanguage();
  const copy = (vi: string, en: string) => (language === "vi" ? vi : en);
  const toolLabels: Record<string, string> = {
    get_factory_summary: copy("Tình trạng nhà máy", "Factory health"),
    get_anomalous_devices: copy("Máy cần chú ý", "Devices needing attention"),
    get_devices_by_temperature_status: copy(
      "Kiểm tra nhiệt độ và kết nối",
      "Temperature and connectivity check",
    ),
    get_device_status: copy("Trạng thái thiết bị", "Device status"),
    get_device_telemetry_history: copy("Lịch sử số đo", "Measurement history"),
    get_recent_alerts: copy("Cảnh báo gần đây", "Recent alerts"),
    get_device_alerts: copy("Cảnh báo của thiết bị", "Device alerts"),
    compare_devices: copy("So sánh thiết bị", "Device comparison"),
  };
  const prefix = useId();
  const evidenceAnchor = (id: string) =>
    `${prefix}-evidence-${encodeURIComponent(id)}`;
  const report = answer.report;
  const displayValue = (value: number | null | undefined) =>
    value == null ? "—" : number(value);
  const statusLabels = {
    normal: copy("Trong ngưỡng đã kiểm tra", "Within checked thresholds"),
    overheat: copy("Quá nhiệt", "Overheat"),
    underheat: copy("Dưới ngưỡng nhiệt", "Underheat"),
    offline: copy("Mất kết nối", "Offline"),
    stale: copy("Số đo cũ", "Stale reading"),
    unknown: copy("Chưa đủ căn cứ", "Insufficient evidence"),
  };
  return (
    <div className="investigation-view">
      <div className="investigation-conclusion">
        <p className="investigation-meta">
          {answer.mode === "gemini"
            ? copy(
                "Gemini phân tích · Backend cung cấp bằng chứng",
                "Gemini analysis · Backend evidence",
              )
            : copy("Kết quả trực tiếp từ backend", "Direct backend results")}
          {report && (
            <>
              {" "}
              · {stamp(report.generatedAt)} ·{" "}
              {report.status === "complete"
                ? copy("Hoàn tất", "Complete")
                : report.status === "partial"
                  ? copy("Kết quả một phần", "Partial results")
                  : copy("Chưa thể điều tra", "Unavailable")}
            </>
          )}
        </p>
      </div>
      {answer.notice && (
        <p className="investigation-warning" role="status">
          {tr(answer.notice)}
        </p>
      )}
      {!!report?.findings.length && (
        <section
          className="investigation-findings"
          aria-label={copy(
            "Phân tích có bằng chứng",
            "Evidence based findings",
          )}
        >
          {report.findings.map((finding, index) => (
            <div key={index}>
              <h4>{finding.title}</h4>
              <p>{finding.explanation}</p>
              <p className="investigation-citations">
                {copy("Bằng chứng:", "Evidence:")}{" "}
                {finding.evidenceIds.map((id) => (
                  <a key={id} href={`#${evidenceAnchor(id)}`}>
                    {id}
                  </a>
                ))}
              </p>
              {finding.nextCheck && (
                <p>
                  <strong>{copy("Kiểm tra tiếp:", "Next check:")}</strong>{" "}
                  {finding.nextCheck}
                </p>
              )}
            </div>
          ))}
        </section>
      )}
      {answer.results.map((result, index) => (
        <section
          key={index}
          className="investigation-result"
          id={result.evidenceId ? evidenceAnchor(result.evidenceId) : undefined}
        >
          <header className="investigation-source">
            <h4>{toolLabels[result.tool] ?? result.tool}</h4>
            <span>
              {result.evidenceId} ·{" "}
              {copy("Database · Truy vấn lúc", "Database · Queried at")}{" "}
              {stamp(result.queriedAt)}
            </span>
          </header>
          {result.counts && (
            <dl className="investigation-counts">
              {[
                [copy("Đã kiểm tra", "Inspected"), result.counts.inspected],
                [copy("Quá nhiệt", "Overheat"), result.counts.overheat],
                [
                  copy("Dưới ngưỡng nhiệt", "Underheat"),
                  result.counts.underheat,
                ],
                [copy("Mất kết nối", "Offline"), result.counts.offline],
                [copy("Dữ liệu cũ", "Stale data"), result.counts.stale],
                [copy("Chưa đủ căn cứ", "Unknown"), result.counts.unknown],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{typeof value === "number" ? number(value) : value}</dd>
                </div>
              ))}
            </dl>
          )}
          {result.counts && (
            <p className="investigation-meta">
              {copy(
                "Một thiết bị có thể thuộc nhiều nhóm. Đây không phải số máy đã xác nhận hỏng.",
                "A device can belong to several groups. These are not confirmed machine failures.",
              )}
            </p>
          )}
          {result.truncated && (
            <p className="investigation-warning">
              {copy(
                "Kết quả giới hạn; chưa bao phủ toàn bộ thiết bị hoặc lịch sử.",
                "Results are limited; not all devices or history are covered.",
              )}
            </p>
          )}
          {result.partial && (
            <p className="investigation-warning">
              {copy(
                "Một phần dữ liệu chưa truy xuất được. Không kết luận các mục còn thiếu là bình thường.",
                "Some data could not be retrieved. Missing items cannot be assumed normal.",
              )}
            </p>
          )}
          {result.note && (
            <p className="investigation-meta">{tr(result.note)}</p>
          )}
          {result.errors?.map((error, i) => (
            <p className="investigation-warning" key={i}>
              {error.deviceId} · {tr(error.message)}
            </p>
          ))}
          {result.devices?.length === 0 && (
            <p>
              {copy(
                "Không có thiết bị phù hợp trong phạm vi đã kiểm tra.",
                "No matching devices in the checked scope.",
              )}
            </p>
          )}
          <div className="investigation-devices">
            {result.devices?.map((device) => (
              <section key={device.deviceId} className="investigation-device">
                <div className="investigation-device-title">
                  <Link
                    to={`/machines/${encodeURIComponent(device.deviceId)}`}
                    onClick={onNavigate}
                  >
                    {device.name} · {device.deviceId}
                  </Link>
                  {device.priority && (
                    <span
                      className={`investigation-priority ${device.priority}`}
                    >
                      {copy("Ưu tiên", "Priority")}:{" "}
                      {device.priority === "high"
                        ? copy("Cao", "High")
                        : device.priority === "medium"
                          ? copy("Vừa", "Medium")
                          : copy("Thấp", "Low")}
                    </span>
                  )}
                </div>
                <p className="investigation-meta">
                  {device.provenance === "simulation"
                    ? copy("Nguồn mô phỏng", "Simulation source")
                    : copy(
                        "Nguồn thiết bị chưa được xác minh là máy thật",
                        "Physical machine source not verified",
                      )}
                </p>
                <div className="investigation-badges">
                  <Badge value={device.gatewayOnline ? "online" : "offline"} />
                  <Badge value={device.dataFresh ? "fresh" : "old"} />
                  {device.readHealth && (
                    <Badge value={device.readHealth} />
                  )}{" "}
                  {device.deliveryHealth &&
                    device.deliveryHealth !== device.readHealth && (
                      <Badge value={device.deliveryHealth} />
                    )}
                </div>
                {!device.temperatures.length && (
                  <p>
                    {copy(
                      "Chưa xác định thanh ghi nhiệt độ từ cấu hình.",
                      "No temperature register identified from configuration.",
                    )}
                  </p>
                )}
                {device.temperatures.map((reading) => (
                  <div
                    key={reading.metricKey}
                    className="investigation-reading"
                  >
                    <p>
                      <strong>{statusLabels[reading.status]}</strong> ·{" "}
                      {reading.metricKey}: {displayValue(reading.value)}{" "}
                      {reading.unit}
                    </p>
                    <p className="investigation-meta">
                      {copy("Ngưỡng thấp", "Low threshold")}:{" "}
                      {displayValue(reading.low)} ·{" "}
                      {copy("Ngưỡng cao", "High threshold")}:{" "}
                      {displayValue(reading.high)} ·{" "}
                      {copy("Đo lúc", "Measured at")}:{" "}
                      {stamp(reading.measuredAt)}
                    </p>
                    {reading.reason && <p>{tr(reading.reason)}</p>}
                  </div>
                ))}
                {!!device.metrics?.length && (
                  <dl className="investigation-metrics">
                    {device.metrics
                      .filter(
                        (metric) =>
                          !device.temperatures.some(
                            (reading) => reading.metricKey === metric.key,
                          ),
                      )
                      .map((metric) => (
                        <div key={metric.key}>
                          <dt>{metric.key}</dt>
                          <dd>
                            {displayValue(metric.value)} {metric.unit} ·{" "}
                            {metric.readSuccess === false
                              ? copy("Đọc lỗi", "Read error")
                              : metric.readSuccess === true
                                ? copy("Đọc thành công", "Read successful")
                                : copy(
                                    "Chưa xác minh lượt đọc",
                                    "Read not verified",
                                  )}{" "}
                            · {stamp(metric.measuredAt)}
                          </dd>
                        </div>
                      ))}
                  </dl>
                )}
                {!!device.reasons?.length && (
                  <ul>
                    {device.reasons.map((reason, i) => (
                      <li key={i}>{tr(reason)}</li>
                    ))}
                  </ul>
                )}
                {!!device.nextChecks?.length && (
                  <div>
                    <h5>{copy("Bước kiểm tra tiếp theo", "Next checks")}</h5>
                    <ul>
                      {device.nextChecks.map((next, i) => (
                        <li key={i}>{tr(next)}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </section>
            ))}
          </div>
          {!!result.series?.length && (
            <>
              <h4>
                {copy(
                  "Thống kê mẫu đã truy xuất",
                  "Retrieved sample statistics",
                )}
              </h4>
              <p className="investigation-warning">
                {copy(
                  "Đơn vị lịch sử chưa được đối chiếu cấu hình từng mẫu. Không xếp hạng nhiệt độ giữa các chuỗi này.",
                  "Historical units have not been checked against each sample's configuration. Do not rank temperatures across these series.",
                )}
              </p>
              <div
                className="investigation-table-scroll"
                tabIndex={0}
                role="region"
                aria-label={copy(
                  "Bảng thống kê lịch sử",
                  "History statistics table",
                )}
              >
                <table>
                  <caption>
                    {copy(
                      "Thống kê theo từng thiết bị và thanh ghi; không phải kết luận nguyên nhân",
                      "Per device and register statistics; not a cause diagnosis",
                    )}
                  </caption>
                  <thead>
                    <tr>
                      {[
                        copy("Thiết bị / số đo", "Device / metric"),
                        copy("Mẫu", "Samples"),
                        copy("Thấp nhất", "Minimum"),
                        copy("Cao nhất", "Maximum"),
                        copy("Thay đổi", "Change"),
                        copy("Đơn vị", "Unit"),
                      ].map((label) => (
                        <th key={label} scope="col">
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.series.map((series, i) => (
                      <tr key={i}>
                        <th scope="row">
                          {series.deviceId ?? "—"} / {series.metricKey}
                        </th>
                        <td>
                          {number(series.sampledCount ?? series.points.length)}
                        </td>
                        <td>{displayValue(series.min)}</td>
                        <td>{displayValue(series.max)}</td>
                        <td>{displayValue(series.change)}</td>
                        <td>
                          {series.unitVerified
                            ? series.unit
                            : copy("Chưa xác minh", "Unverified")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="investigation-charts">
                {result.series.map((series, i) => {
                  const points = [...series.points].sort(
                    (a, b) => a.timestamp - b.timestamp,
                  );
                  return (
                    <figure key={i} className="investigation-chart">
                      <figcaption>
                        <strong>
                          {series.deviceId ?? "—"} · {series.metricKey}
                        </strong>
                        <span>
                          {copy("Giá trị mẫu · GMT+7", "Sample values · GMT+7")}
                          {series.unitVerified
                            ? ` · ${series.unit}`
                            : ` · ${copy("đơn vị chưa xác minh", "unverified unit")}`}
                        </span>
                      </figcaption>
                      {points.length ? (
                        <div
                          className="investigation-chart-canvas"
                          role="img"
                          aria-label={`${series.deviceId ?? ""} ${series.metricKey}: ${points.length} ${copy("mẫu; số liệu chi tiết ở bảng phía trên", "samples; statistics in the table above")}`}
                        >
                          <ResponsiveContainer width="100%" height="100%">
                            <LineChart
                              data={points}
                              margin={{
                                top: 12,
                                right: 12,
                                left: 0,
                                bottom: 12,
                              }}
                            >
                              <CartesianGrid
                                stroke="#46516b"
                                strokeDasharray="3 3"
                              />
                              <XAxis
                                dataKey="timestamp"
                                type="number"
                                domain={
                                  series.coverage
                                    ? [series.coverage.from, series.coverage.to]
                                    : ["dataMin", "dataMax"]
                                }
                                tickFormatter={(time) =>
                                  new Date(time).toLocaleTimeString(locale(), {
                                    timeZone: "Asia/Ho_Chi_Minh",
                                    hour12: false,
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })
                                }
                                stroke="#bdc9e0"
                                minTickGap={38}
                              />
                              <YAxis
                                stroke="#bdc9e0"
                                tickFormatter={number}
                                width={60}
                                domain={["auto", "auto"]}
                              />
                              <Tooltip
                                labelFormatter={(value) => stamp(Number(value))}
                                formatter={(value) => [
                                  typeof value === "number"
                                    ? number(value)
                                    : "—",
                                  series.metricKey,
                                ]}
                                contentStyle={{
                                  background: "#10172b",
                                  color: "#f5f7ff",
                                  borderColor: "#73849e",
                                }}
                              />
                              <Line
                                dataKey="value"
                                name={series.metricKey}
                                stroke="none"
                                dot={{ r: 3, fill: "#66e1ff" }}
                                activeDot={{ r: 5, fill: "#00ed48" }}
                                isAnimationActive={false}
                              />
                            </LineChart>
                          </ResponsiveContainer>
                        </div>
                      ) : (
                        <p className="investigation-empty">
                          {copy(
                            "Không có mẫu trong khoảng yêu cầu. Chưa thể vẽ xu hướng.",
                            "No samples in the requested range. A trend cannot be plotted.",
                          )}
                        </p>
                      )}
                      <p className="investigation-meta">
                        {copy(
                          "Mỗi điểm là một mẫu thực từ database; không nối đường để tránh suy diễn dữ liệu giữa các mẫu.",
                          "Each dot is a database sample; points are not joined to avoid implying data between samples.",
                        )}
                      </p>
                      {series.coverage && (
                        <p className="investigation-meta">
                          {copy("Khoảng yêu cầu", "Requested range")}:{" "}
                          {stamp(series.coverage.from)} →{" "}
                          {stamp(series.coverage.to)}
                          <br />
                          {copy("Mẫu đầu / cuối", "First / last sample")}:{" "}
                          {stamp(series.coverage.firstSampleAt)} /{" "}
                          {stamp(series.coverage.lastSampleAt)}
                        </p>
                      )}
                      {series.currentUnit && !series.unitVerified && (
                        <p className="investigation-meta">
                          {copy(
                            "Đơn vị cấu hình hiện tại",
                            "Current configuration unit",
                          )}
                          : {series.currentUnit} ·{" "}
                          {copy(
                            "không áp dụng ngược cho lịch sử",
                            "not retroactively applied to history",
                          )}
                        </p>
                      )}
                    </figure>
                  );
                })}
              </div>
            </>
          )}
          {result.alerts && (
            <>
              <h4>{copy("Sự kiện cảnh báo", "Alert events")}</h4>
              {!result.alerts.length ? (
                <p>
                  {copy(
                    "Không có sự kiện trong khoảng đã kiểm tra.",
                    "No events in the checked range.",
                  )}
                </p>
              ) : (
                <ul className="investigation-alerts">
                  {result.alerts.map((alert) => (
                    <li key={alert.id}>
                      <Link
                        to={`/machines/${encodeURIComponent(alert.deviceId)}`}
                        onClick={onNavigate}
                      >
                        {alert.deviceId}
                      </Link>{" "}
                      · {alert.code} · <Badge value={alert.severity} /> ·{" "}
                      {displayValue(alert.value)} · {stamp(alert.timestamp)}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </section>
      ))}
      {report && (
        <>
          {!!report.limitations.length && (
            <section className="investigation-limitations">
              <h4>{copy("Giới hạn của kết quả", "Result limitations")}</h4>
              <ul>
                {report.limitations.map((limit, i) => (
                  <li key={i}>{tr(limit)}</li>
                ))}
              </ul>
            </section>
          )}
          {report.followUp && (
            <p className="investigation-follow-up">
              <strong>{copy("Có thể hỏi tiếp:", "Follow up:")}</strong>{" "}
              {report.followUp}
            </p>
          )}
          <details className="investigation-trace">
            <summary>
              {copy(
                "Nguồn dữ liệu và công cụ đã dùng",
                "Data sources and tools used",
              )}{" "}
              ({report.trace.length})
            </summary>
            <ul>
              {report.evidence.map((evidence) => (
                <li key={evidence.id}>
                  <a href={`#${evidenceAnchor(evidence.id)}`}>{evidence.id}</a>{" "}
                  · {evidence.tool} · {stamp(evidence.queriedAt)}
                </li>
              ))}
            </ul>
            <ol>
              {report.trace.map((step, i) => (
                <li key={i}>
                  {step.tool} · {copy("Vòng", "Round")} {step.round} ·{" "}
                  {step.status === "success"
                    ? copy("Thành công", "Success")
                    : copy("Lỗi", "Error")}{" "}
                  · {number(step.durationMs)} ms
                  {step.error && <p>{tr(step.error)}</p>}
                </li>
              ))}
            </ol>
          </details>
        </>
      )}
      <p className="investigation-meta">
        {copy(
          "Mất kết nối hoặc cảnh báo không xác nhận máy hỏng. AI chỉ đọc dữ liệu; bước xử lý cần người có trách nhiệm kiểm tra.",
          "Offline status or alerts do not confirm a machine failure. AI only reads data; corrective action requires a responsible person to verify it.",
        )}
      </p>
    </div>
  );
}

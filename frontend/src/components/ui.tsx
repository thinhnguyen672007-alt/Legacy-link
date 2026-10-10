import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  MinusCircle,
  Radio,
  WifiOff,
} from "lucide-react";
import type { ReactNode } from "react";
export const stamp = (time?: string | number | null) =>
  time == null
    ? "Chưa có"
    : new Date(time).toLocaleString("vi-VN", {
        timeZone: "Asia/Ho_Chi_Minh",
        hour12: false,
      });
export const number = (v: number) =>
  new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 3 }).format(v);
const states: Record<string, [string, string]> = {
  online: ["Liên lạc được", "ok"],
  offline: ["Mất liên lạc", "muted"],
  fresh: ["Dữ liệu mới", "ok"],
  old: ["Dữ liệu cũ", "warn"],
  out_of_range: ["Ngoài khoảng dự kiến", "warn"],
  healthy: ["Bình thường", "ok"],
  read_error: ["Lỗi đọc", "bad"],
  read_ok: ["Đọc thành công", "ok"],
  unknown: ["Chưa rõ", "muted"],
  stale: ["Báo cáo cũ", "warn"],
  backlog: ["Đang chờ xác nhận", "warn"],
  rejected: ["Bị từ chối", "bad"],
  loss_observed: ["Đã ghi nhận mất mẫu", "bad"],
  critical: ["Nghiêm trọng", "bad"],
  high: ["Cao", "bad"],
  medium: ["Vừa", "warn"],
  low: ["Thấp", "muted"],
};
export function Badge({ value }: { value?: string }) {
  const [label, tone] = states[value ?? "unknown"] ?? [
    value ?? "Chưa rõ",
    "muted",
  ];
  const Icon =
    tone === "ok"
      ? CheckCircle2
      : tone === "bad"
        ? AlertCircle
        : tone === "warn"
          ? Clock3
          : MinusCircle;
  return (
    <span className={`badge ${tone}`}>
      <Icon size={14} />
      {label}
    </span>
  );
}
export function Notice({
  children,
  tone = "info",
}: {
  children: ReactNode;
  tone?: string;
}) {
  return (
    <div
      className={`notice ${tone}`}
      role={tone === "bad" ? "alert" : undefined}
    >
      <AlertCircle size={18} />
      <div>{children}</div>
    </div>
  );
}
export function QueryState({
  error,
  loading,
  updated,
}: {
  error: Error | null;
  loading: boolean;
  updated?: number;
}) {
  return (
    <>
      {error && (
        <Notice tone="bad">
          {error.message}
          {updated
            ? ` Dữ liệu bên dưới là bản gần nhất lúc ${stamp(updated)}.`
            : ""}
        </Notice>
      )}
      {loading && (
        <p className="loading" role="status">
          Đang đọc dữ liệu…
        </p>
      )}
    </>
  );
}
export function Empty({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="empty">
      <Radio size={30} />
      <h2>{title}</h2>
      <p>{children}</p>
    </div>
  );
}
export function ApiState({
  error,
  updated,
}: {
  error: Error | null;
  updated: number;
}) {
  return (
    <span className={`api-state ${error ? "bad" : ""}`}>
      {error ? <WifiOff size={15} /> : <Radio size={15} />}{" "}
      {error
        ? "Không cập nhật được"
        : updated
          ? "Đã nhận phản hồi API"
          : "Đang kết nối"}
    </span>
  );
}
export function PageHead({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-head">
      <div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action}
    </div>
  );
}

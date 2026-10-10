import { z } from "zod";
import {
  copilotSchema,
  alarmSchema,
  configSchema,
  gatewaySchema,
  machineSchema,
  operationSchema,
  pageSchema,
  previewSchema,
  profileSchema,
  telemetrySchema,
  type Config,
} from "./schema";
export class ApiError extends Error {
  constructor(
    message: string,
    public status = 0,
    public retryAfterMs = 0,
    public uncertain = false,
  ) {
    super(message);
  }
}
const messages: Record<number, string> = {
  401: "Phiên đăng nhập không hợp lệ hoặc đã hết hạn. Hãy đăng nhập lại.",
  403: "Không có quyền thao tác hoặc origin chưa được cho phép.",
  404: "Không tìm thấy dữ liệu yêu cầu.",
  409: "Thiết bị đang có thao tác khác. Kiểm tra lịch sử trước khi thử lại.",
  429: "API đang giới hạn số yêu cầu. Hệ thống sẽ giảm tần suất đọc.",
  503: "API chưa sẵn sàng. Kiểm tra dịch vụ backend.",
};
export function normalizeUrl(input: string) {
  const u = new URL(input.trim());
  if (
    !["http:", "https:"].includes(u.protocol) ||
    u.username ||
    u.password ||
    u.search ||
    u.hash
  )
    throw new Error(
      "URL phải là HTTP/HTTPS, không chứa token, tài khoản hoặc tham số.",
    );
  return u.toString().replace(/\/$/, "");
}
export async function request<T>(
  base: string,
  path: string,
  token: string,
  schema: z.ZodType<T>,
  {
    method = "GET",
    body,
    signal,
    timeoutMs = 12000,
  }: {
    method?: string;
    body?: unknown;
    signal?: AbortSignal;
    timeoutMs?: number;
  } = {},
): Promise<T> {
  const timer = AbortSignal.timeout(timeoutMs);
  const combined = signal ? AbortSignal.any([signal, timer]) : timer;
  let response: Response;
  try {
    response = await fetch(base + path, {
      method,
      signal: combined,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch {
    if (signal?.aborted) throw new DOMException("Đã hủy", "AbortError");
    throw new ApiError(
      timer.aborted
        ? "Yêu cầu quá thời gian chờ."
        : "Không kết nối được API. Kiểm tra URL, mạng và cấu hình CORS.",
      0,
      0,
      method === "POST",
    );
  }
  let text: string;
  try {
    text = await response.text();
  } catch {
    throw new ApiError(
      "Không đọc được phản hồi API.",
      response.status,
      0,
      method === "POST",
    );
  }
  let data: unknown;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!response.ok) {
    const retry = response.headers.get("Retry-After");
    const seconds = Number(retry);
    const wait = retry
      ? Number.isFinite(seconds)
        ? seconds * 1000
        : Date.parse(retry) - Date.now()
      : 0;
    const detail = z.object({ error: z.string() }).safeParse(data);
    throw new ApiError(
      (messages[response.status] ?? `API trả lỗi HTTP ${response.status}.`) +
        (detail.success ? ` ${detail.data.error}` : ""),
      response.status,
      Math.min(120000, Math.max(0, wait || 0)),
      method === "POST" && response.status >= 500,
    );
  }
  const parsed = schema.safeParse(data);
  if (!parsed.success)
    throw new ApiError(
      "Phản hồi API không đúng cấu trúc. Có thể đang gọi sai cổng hoặc proxy trả nội dung khác.",
      response.status,
      0,
      method === "POST",
    );
  return parsed.data;
}
export type Session = { user?: import("./accounts").Account; base: string; readToken: string; writeToken: string };
export function createApi(s: Session) {
  const get = <T>(p: string, schema: z.ZodType<T>, signal?: AbortSignal) =>
    request(s.base, p, s.readToken || s.writeToken, schema, { signal });
  const post = <T>(p: string, schema: z.ZodType<T>, body?: unknown) =>
    request(s.base, p, s.writeToken, schema, { method: "POST", body });
  const id = encodeURIComponent;
  const query = (q: Record<string, string | number | undefined>) =>
    new URLSearchParams(
      Object.entries(q)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => [k, String(v)]),
    ).toString();
  return {
    copilot: (
      body: { question?: string; action?: string; conversationId?: string },
      signal?: AbortSignal,
    ) =>
      request(
        s.base,
        body.action ? "/ai/query" : "/ai/chat",
        s.readToken || s.writeToken,
        copilotSchema,
        { method: "POST", body, signal, timeoutMs: 35000 },
      ),
    machines: (signal?: AbortSignal) =>
      get("/machines", z.array(machineSchema), signal),
    machine: (d: string, signal?: AbortSignal) =>
      get(`/machines/${id(d)}`, machineSchema, signal),
    catalog: (d: string, signal?: AbortSignal) =>
      get(`/catalog?deviceId=${id(d)}`, configSchema, signal),
    telemetry: (
      d: string,
      q: Record<string, string | number | undefined>,
      signal?: AbortSignal,
    ) =>
      get(
        `/machines/${id(d)}/telemetry?${query(q)}`,
        pageSchema(telemetrySchema),
        signal,
      ),
    alarms: (
      q: Record<string, string | number | undefined>,
      signal?: AbortSignal,
    ) => get(`/alarms?${query(q)}`, pageSchema(alarmSchema), signal),
    ack: (a: string) => post(`/alarms/${id(a)}/ack`, alarmSchema),
    gateways: (signal?: AbortSignal) =>
      get("/gateways", z.array(gatewaySchema), signal),
    profiles: (signal?: AbortSignal) =>
      get("/profiles", z.array(profileSchema), signal),
    profile: (p: string, revision: number) =>
      get(
        `/profiles/${id(p)}/export?revision=${revision}`,
        z.object({ config: configSchema }),
      ),
    preview: (config: Config) =>
      post("/config/preview", previewSchema, { config }),
    probe: (g: string, config: Config) =>
      post(`/gateways/${id(g)}/probe`, operationSchema, { config }),
    apply: (
      g: string,
      config: Config,
      probeRequestId: string,
      acceptWarnings: boolean,
    ) =>
      post(`/gateways/${id(g)}/apply`, operationSchema, {
        config,
        probeRequestId,
        acceptWarnings,
      }),
    operation: (op: string, signal?: AbortSignal) =>
      get(`/operations/${id(op)}`, operationSchema, signal),
    operations: (gateway: string, signal?: AbortSignal) =>
      get(
        `/operations?gatewayId=${id(gateway)}`,
        z.array(operationSchema),
        signal,
      ),
  };
}

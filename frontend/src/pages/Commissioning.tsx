import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import * as Dialog from "@radix-ui/react-dialog";
import { Check, FlaskConical, Plus, Send, Trash2, X } from "lucide-react";
import { ApiError } from "../api/client";
import {
  canApply,
  terminal,
  type Config,
  type Operation,
  type Register,
} from "../api/schema";
import { useApi, useSession, polling } from "../session";
import {
  Badge,
  Notice,
  PageHead,
  QueryState,
  number,
  stamp,
} from "../components/ui";
const newRegister = (): Register => ({
  key: "temperature",
  address: 0,
  functionCode: 3,
  dataType: "INT16",
  scale: 1,
  unit: "",
  wordOrder: "HIGH_FIRST",
});
const newConfig = (): Config => ({
  deviceId: "",
  deviceName: "",
  protocol: "MODBUS_RTU",
  baudRate: 9600,
  parity: "NONE",
  stopBits: 1,
  slaveId: 1,
  samplingIntervalMs: 2000,
  registerMap: [newRegister()],
});
const phaseNames: Record<string, string> = {
  sending: "Đang gửi",
  sent: "Đã gửi, chờ thiết bị",
  received: "Thiết bị đã nhận",
  completed: "Đọc thử hoàn tất",
  saving_catalog: "Đang lưu catalog",
  applied: "Đã áp dụng",
  rejected: "Thiết bị từ chối",
  timed_out: "Quá hạn, cần kiểm tra kết quả",
  publish_failed: "Gửi lệnh thất bại",
  catalog_error: "Thiết bị đã áp dụng, lưu catalog lỗi",
};
export function Commissioning({ active }: { active: boolean }) {
  const api = useApi();
  const { session } = useSession();
  const client = useQueryClient();
  const [params] = useSearchParams();
  const [gateway, setGateway] = useState("");
  const [source, setSource] = useState("");
  const [config, setConfig] = useState<Config>(newConfig);
  const [preview, setPreview] = useState<Config>();
  const [previewWarnings, setPreviewWarnings] = useState<string[]>([]);
  const [probeId, setProbeId] = useState("");
  const [applyId, setApplyId] = useState("");
  const [error, setError] = useState("");
  const [uncertain, setUncertain] = useState(false);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [acceptedProbeId, setAcceptedProbeId] = useState("");
  const acceptWarnings = !!probeId && acceptedProbeId === probeId;
  const [reviewedOperationId, setReviewedOperationId] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [historyOpen, setHistoryOpen] = useState(false);
  const gateways = useQuery({
    queryKey: ["gateways"],
    queryFn: ({ signal }) => api.gateways(signal),
    enabled: active,
    refetchInterval: polling(5000),
  });
  const profiles = useQuery({
    queryKey: ["profiles"],
    queryFn: ({ signal }) => api.profiles(signal),
    enabled: active,
    staleTime: 60000,
  });
  const op = useQuery({
    queryKey: ["operation", applyId || probeId],
    queryFn: ({ signal }) => api.operation(applyId || probeId, signal),
    enabled: active && !!(applyId || probeId),
    refetchInterval: (q) =>
      q.state.data && terminal(q.state.data) ? false : polling(2000)(q),
  });
  const history = useQuery({
    queryKey: ["operations", gateway],
    queryFn: ({ signal }) => api.operations(gateway, signal),
    enabled: active && historyOpen && !!gateway,
  });
  const g = gateways.data?.find((g) => g.gatewayId === gateway);
  const probe =
    op.data?.kind === "probe"
      ? op.data
      : client.getQueryData<Operation>(["operation", probeId]);
  const running = !!(applyId || probeId) && (!op.data || !terminal(op.data));
  const locked = busy || running || uncertain;
  const editable = !locked;
  const inRange =
    probe?.readings?.every((r) => r.withinRange !== false) ?? false;
  const ready =
    canApply(probe, preview, g, now) &&
    !gateways.error &&
    !applyId &&
    !uncertain &&
    (inRange || acceptWarnings);
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);
  function invalidate() {
    setPreview(undefined);
    setPreviewWarnings([]);
    setProbeId("");
    setApplyId("");
    setAcceptedProbeId("");
    setError("");
  }
  function edit(next: Config) {
    invalidate();
    setConfig(next);
  }
  async function run(action: () => Promise<void>, post = false) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Thao tác thất bại.");
      if (post && e instanceof ApiError && e.uncertain) {
        setUncertain(true);
        setHistoryOpen(true);
        void history.refetch();
      }
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function loadCatalog() {
    const device = params.get("device") || config.deviceId;
    if (!device) {
      setError("Nhập mã thiết bị để đọc catalog hiện tại.");
      return;
    }
    await run(async () => edit(await api.catalog(device)));
  }
  function remember(result: Operation) {
    setAcceptedProbeId("");
    client.setQueryData(["operation", result.id], result);
    if (result.kind === "probe") {
      setApplyId("");
      setProbeId(result.id);
    } else setApplyId(result.id);
  }
  function rowEdit(i: number, patch: Partial<Register>) {
    edit({
      ...config,
      registerMap: config.registerMap.map((r, j) =>
        j === i ? { ...r, ...patch } : r,
      ),
    });
  }
  const numberField = (
    label: string,
    key: "slaveId" | "baudRate" | "stopBits" | "samplingIntervalMs",
    min: number,
    max: number,
  ) => (
    <label>
      {label}
      <input
        type="number"
        required
        min={min}
        max={max}
        value={Number.isFinite(config[key]) ? config[key] : ""}
        onChange={(e) => edit({ ...config, [key]: e.target.valueAsNumber })}
      />
    </label>
  );
  return (
    <div hidden={!active}>
      <PageHead
        title="Cấu hình thiết bị"
        description="Kiểm tra cấu hình, đọc thử trên gateway, rồi áp dụng đúng kết quả đã thử."
      />
      <ol className="steps">
        {["Chuẩn bị cấu hình", "Kiểm tra & đọc thử", "Áp dụng & đối chiếu"].map(
          (s, i) => (
            <li
              className={(applyId ? 2 : preview ? 1 : 0) === i ? "current" : ""}
              key={s}
            >
              <span>{i + 1}</span>
              {s}
            </li>
          ),
        )}
      </ol>
      {!session?.writeToken && (
        <Notice>
          Phiên chỉ đọc. Cần token thao tác để preview, đọc thử và áp dụng.
        </Notice>
      )}
      {uncertain && (
        <Notice tone="bad">
          Chưa xác định được kết quả gửi lệnh. Không gửi lại tự động. Xem lịch
          sử thao tác và trạng thái gateway trước khi tiếp tục.
        </Notice>
      )}
      {error && <Notice tone="bad">{error}</Notice>}
      <div className="commission-grid">
        <form
          className="surface section"
          onSubmit={(e) => {
            e.preventDefault();
            if (!session?.writeToken || locked) return;
            void run(async () => {
              const result = await api.preview(config);
              setConfig(result.config);
              setPreview(result.config);
              setPreviewWarnings(result.warnings);
              setProbeId("");
              setApplyId("");
            });
          }}
        >
          <h2>Thiết bị & nguồn cấu hình</h2>
          <fieldset disabled={!editable}>
            <div className="form-grid">
              <label>
                Gateway
                <select
                  required
                  value={gateway}
                  onChange={(e) => {
                    setGateway(e.target.value);
                    invalidate();
                  }}
                >
                  <option value="">Chọn gateway</option>
                  {gateways.data?.map((g) => (
                    <option value={g.gatewayId} key={g.gatewayId}>
                      {g.gatewayId} ·{" "}
                      {g.online ? "Sẵn sàng" : "Trạng thái cũ/offline"}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Profile có sẵn
                <select
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                >
                  <option value="">Cấu hình thủ công</option>
                  {profiles.data?.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} · r{p.revision}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="toolbar">
              <button
                type="button"
                disabled={!source}
                onClick={() =>
                  void run(async () => {
                    const p = profiles.data?.find((p) => p.id === source);
                    if (p) edit((await api.profile(p.id, p.revision)).config);
                  })
                }
              >
                Nạp profile
              </button>
              <button type="button" onClick={() => void loadCatalog()}>
                Đọc catalog {params.get("device") ?? "theo mã máy"}
              </button>
            </div>
            <QueryState
              error={gateways.error || profiles.error}
              loading={gateways.isPending || profiles.isPending}
            />
            <div className="form-grid">
              <label>
                Mã thiết bị
                <input
                  required
                  pattern="[A-Za-z0-9_-]{1,31}"
                  value={config.deviceId}
                  onChange={(e) =>
                    edit({ ...config, deviceId: e.target.value })
                  }
                />
              </label>
              <label>
                Tên thiết bị
                <input
                  required
                  value={config.deviceName}
                  onChange={(e) =>
                    edit({ ...config, deviceName: e.target.value })
                  }
                />
              </label>
              {numberField("Địa chỉ slave", "slaveId", 1, 247)}
              {numberField(
                "Chu kỳ đọc (ms)",
                "samplingIntervalMs",
                100,
                86400000,
              )}
            </div>
            <details>
              <summary>Truyền thông Modbus RTU</summary>
              <div className="form-grid">
                {numberField("Baud rate", "baudRate", 300, 2000000)}
                <label>
                  Parity
                  <select
                    value={config.parity}
                    onChange={(e) =>
                      edit({
                        ...config,
                        parity: e.target.value as Config["parity"],
                      })
                    }
                  >
                    <option>NONE</option>
                    <option>EVEN</option>
                    <option>ODD</option>
                  </select>
                </label>
                {numberField("Stop bits", "stopBits", 1, 2)}
              </div>
            </details>
            <div className="section-title">
              <h2>Thông số cần đọc</h2>
              <button
                type="button"
                disabled={config.registerMap.length >= 16}
                onClick={() =>
                  edit({
                    ...config,
                    registerMap: [...config.registerMap, newRegister()],
                  })
                }
              >
                <Plus size={15} />
                Thêm
              </button>
            </div>
            <p className="help">
              Địa chỉ thanh ghi là địa chỉ thô bắt đầu từ 0, không phải số
              40001. Scale chỉ áp dụng một lần tại firmware.
            </p>
            {config.registerMap.map((r, i) => (
              <div className="register" key={i}>
                <div className="section-title">
                  <h3>Thông số {i + 1}</h3>
                  <button
                    className="quiet"
                    type="button"
                    disabled={config.registerMap.length === 1}
                    aria-label={`Xóa thông số ${i + 1}`}
                    onClick={() =>
                      edit({
                        ...config,
                        registerMap: config.registerMap.filter(
                          (_, j) => i !== j,
                        ),
                      })
                    }
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
                <div className="form-grid">
                  <label>
                    Metric
                    <input
                      required
                      pattern="[A-Za-z][A-Za-z0-9_]{0,18}"
                      value={r.key}
                      onChange={(e) => rowEdit(i, { key: e.target.value })}
                    />
                  </label>
                  <label>
                    Địa chỉ thô
                    <input
                      required
                      type="number"
                      min="0"
                      max={r.dataType === "UINT32" ? 65534 : 65535}
                      value={Number.isFinite(r.address) ? r.address : ""}
                      onChange={(e) =>
                        rowEdit(i, { address: e.target.valueAsNumber })
                      }
                    />
                  </label>
                  <label>
                    Kiểu dữ liệu
                    <select
                      value={r.dataType}
                      onChange={(e) =>
                        rowEdit(i, {
                          dataType: e.target.value as Register["dataType"],
                        })
                      }
                    >
                      <option>INT16</option>
                      <option>UINT16</option>
                      <option>UINT32</option>
                    </select>
                  </label>
                  <label>
                    Hệ số scale
                    <input
                      required
                      type="number"
                      step="any"
                      value={Number.isFinite(r.scale) ? r.scale : ""}
                      onChange={(e) =>
                        rowEdit(i, { scale: e.target.valueAsNumber })
                      }
                    />
                  </label>
                  <label>
                    Đơn vị
                    <input
                      value={r.unit}
                      onChange={(e) => rowEdit(i, { unit: e.target.value })}
                    />
                  </label>
                  <label>
                    Hàm đọc
                    <select
                      value={r.functionCode}
                      onChange={(e) =>
                        rowEdit(i, { functionCode: Number(e.target.value) })
                      }
                    >
                      <option value="3">03 · Holding registers</option>
                      <option value="4">04 · Input registers</option>
                    </select>
                  </label>
                </div>
                <details>
                  <summary>Khoảng dự kiến, thứ tự word & cảnh báo</summary>
                  <div className="form-grid">
                    <label>
                      Loại số đo
                      <select
                        value={r.metricType ?? ""}
                        onChange={(e) =>
                          rowEdit(i, {
                            metricType: e.target.value
                              ? (e.target.value as Register["metricType"])
                              : undefined,
                          })
                        }
                      >
                        <option value="">Chưa khai báo</option>
                        <option value="temperature">Nhiệt độ</option>
                        <option value="generic">Số đo khác</option>
                      </select>
                    </label>
                    <label>
                      Thứ tự word
                      <select
                        value={r.wordOrder}
                        onChange={(e) =>
                          rowEdit(i, {
                            wordOrder: e.target.value as Register["wordOrder"],
                          })
                        }
                      >
                        <option>HIGH_FIRST</option>
                        <option>LOW_FIRST</option>
                      </select>
                    </label>
                    {(["expectedMin", "expectedMax"] as const).map((k) => (
                      <label key={k}>
                        {k === "expectedMin"
                          ? "Giá trị nhỏ nhất dự kiến"
                          : "Giá trị lớn nhất dự kiến"}
                        <input
                          type="number"
                          step="any"
                          value={r[k] ?? ""}
                          onChange={(e) =>
                            rowEdit(i, {
                              [k]:
                                e.target.value === ""
                                  ? undefined
                                  : e.target.valueAsNumber,
                            })
                          }
                        />
                      </label>
                    ))}
                  </div>
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={!!r.alarm}
                      onChange={(e) =>
                        rowEdit(i, {
                          alarm: e.target.checked
                            ? {
                                threshold: 80,
                                hysteresis: 2,
                                code: "OVERHEAT",
                                severity: "high",
                              }
                            : undefined,
                        })
                      }
                    />
                    Bật ngưỡng cảnh báo
                  </label>
                  {r.alarm && (
                    <div className="form-grid">
                      <label>
                        Ngưỡng cao
                        <input
                          required
                          type="number"
                          step="any"
                          value={r.alarm.threshold}
                          onChange={(e) =>
                            rowEdit(i, {
                              alarm: {
                                ...r.alarm!,
                                threshold: e.target.valueAsNumber,
                              },
                            })
                          }
                        />
                      </label>
                      <label>
                        Độ trễ tái báo
                        <input
                          required
                          type="number"
                          min="0"
                          step="any"
                          value={r.alarm.hysteresis}
                          onChange={(e) =>
                            rowEdit(i, {
                              alarm: {
                                ...r.alarm!,
                                hysteresis: e.target.valueAsNumber,
                              },
                            })
                          }
                        />
                      </label>
                      <label>
                        Mã cảnh báo
                        <select
                          value={r.alarm.code}
                          onChange={(e) =>
                            rowEdit(i, {
                              alarm: {
                                ...r.alarm!,
                                code: e.target.value as NonNullable<
                                  Register["alarm"]
                                >["code"],
                              },
                            })
                          }
                        >
                          {[
                            "OVERHEAT",
                            "OVERCURRENT",
                            "OVERSPEED",
                            "VIBRATION",
                          ].map((v) => (
                            <option key={v}>{v}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Mức cảnh báo
                        <select
                          value={r.alarm.severity}
                          onChange={(e) =>
                            rowEdit(i, {
                              alarm: {
                                ...r.alarm!,
                                severity: e.target.value as NonNullable<
                                  Register["alarm"]
                                >["severity"],
                                criticalThreshold: undefined,
                              },
                            })
                          }
                        >
                          {["low", "medium", "high", "critical"].map((v) => (
                            <option key={v}>{v}</option>
                          ))}
                        </select>
                      </label>
                      {r.alarm.severity === "high" && (
                        <label>
                          Ngưỡng nghiêm trọng (tùy chọn)
                          <input
                            type="number"
                            step="any"
                            value={r.alarm.criticalThreshold ?? ""}
                            onChange={(e) =>
                              rowEdit(i, {
                                alarm: {
                                  ...r.alarm!,
                                  criticalThreshold:
                                    e.target.value === ""
                                      ? undefined
                                      : e.target.valueAsNumber,
                                },
                              })
                            }
                          />
                        </label>
                      )}
                    </div>
                  )}
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={!!r.lowAlarm}
                      onChange={(e) =>
                        rowEdit(i, {
                          lowAlarm: e.target.checked
                            ? {
                                threshold: 0,
                                hysteresis: 0,
                                code: "UNDERHEAT",
                                severity: "high",
                              }
                            : undefined,
                        })
                      }
                    />{" "}
                    Bật cảnh báo nhiệt độ thấp (UNDERHEAT)
                  </label>
                  {r.lowAlarm && (
                    <>
                      <p className="help">
                        Điền ngưỡng thực tế theo máy và đơn vị số đo. Giá trị 0
                        chỉ là bản nháp, không phải ngưỡng khuyến nghị. Nhiệt độ
                        thấp khi máy chưa chạy có thể là bình thường.
                      </p>
                      <div className="form-grid">
                        <label>
                          Ngưỡng thấp ({r.unit || "chưa có đơn vị"})
                          <input
                            required
                            type="number"
                            step="any"
                            value={r.lowAlarm.threshold}
                            onChange={(e) =>
                              rowEdit(i, {
                                lowAlarm: {
                                  ...r.lowAlarm!,
                                  threshold: e.target.valueAsNumber,
                                },
                              })
                            }
                          />
                        </label>
                        <label>
                          Độ tăng để cho phép báo lại
                          <input
                            required
                            type="number"
                            step="any"
                            min="0"
                            value={r.lowAlarm.hysteresis}
                            onChange={(e) =>
                              rowEdit(i, {
                                lowAlarm: {
                                  ...r.lowAlarm!,
                                  hysteresis: e.target.valueAsNumber,
                                },
                              })
                            }
                          />
                        </label>
                        <label>
                          Mức độ
                          <select
                            value={r.lowAlarm.severity}
                            onChange={(e) =>
                              rowEdit(i, {
                                lowAlarm: {
                                  ...r.lowAlarm!,
                                  severity: e.target.value as NonNullable<
                                    Register["lowAlarm"]
                                  >["severity"],
                                },
                              })
                            }
                          >
                            {["low", "medium", "high", "critical"].map((v) => (
                              <option key={v}>{v}</option>
                            ))}
                          </select>
                        </label>
                      </div>
                    </>
                  )}
                </details>
              </div>
            ))}
          </fieldset>
          <button
            className="primary"
            disabled={locked || !session?.writeToken || !gateway}
          >
            {busy ? "Đang xử lý…" : "Kiểm tra cấu hình"}
          </button>
          <p className="help">
            Mọi thay đổi sau khi đọc thử đều yêu cầu kiểm tra và đọc thử lại.
            Chưa gửi cấu hình đến thiết bị ở bước này.
          </p>
        </form>
        <aside className="commission-side">
          <div className="surface section">
            <h2>Đọc thử & áp dụng</h2>
            <p>
              Gateway <span className="mono">{gateway || "chưa chọn"}</span>
            </p>
            <Badge value={g?.online ? "online" : "unknown"} />
            {preview ? (
              <>
                <p>
                  <Check size={16} className="inline-icon" />
                  Cấu hình hợp lệ: {preview.deviceId}
                </p>
                {previewWarnings.map((w) => (
                  <Notice key={w}>{w}</Notice>
                ))}
                <button
                  className="wide"
                  disabled={
                    locked ||
                    !g?.online ||
                    !!gateways.error ||
                    !session?.writeToken
                  }
                  onClick={() =>
                    void run(async () => {
                      setApplyId("");
                      setAcceptedProbeId("");
                      remember(await api.probe(gateway, preview));
                    }, true)
                  }
                >
                  <FlaskConical size={17} />
                  Đọc thử trên gateway
                </button>
              </>
            ) : (
              <p className="muted">
                Hoàn thành kiểm tra cấu hình để mở bước đọc thử.
              </p>
            )}
            <QueryState
              error={op.error}
              loading={!!(applyId || probeId) && op.isPending}
            />
            {op.data && <OperationResult op={op.data} />}
            {probe?.phase === "completed" && !applyId && (
              <>
                <p className="help">
                  Kết quả đọc thử còn{" "}
                  {Math.max(
                    0,
                    Math.ceil(((probe.finishedAt ?? 0) + 60000 - now) / 1000),
                  )}{" "}
                  giây hiệu lực; backend sẽ kiểm tra lại boot và config.
                </p>
                {!inRange && (
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={acceptWarnings}
                      onChange={(e) =>
                        setAcceptedProbeId(e.target.checked ? probeId : "")
                      }
                    />
                    Tôi đã xem và chấp nhận số đo ngoài khoảng dự kiến.
                  </label>
                )}
              </>
            )}
            <Dialog.Root open={confirm} onOpenChange={setConfirm}>
              <Dialog.Trigger asChild>
                <button
                  className="primary wide"
                  disabled={!ready || busy || !session?.writeToken}
                >
                  <Send size={17} />
                  Xem lại và áp dụng
                </button>
              </Dialog.Trigger>
              <Dialog.Portal>
                <Dialog.Overlay className="dialog-overlay" />
                <Dialog.Content className="dialog-content">
                  <Dialog.Title>
                    Áp dụng cấu hình cho {preview?.deviceId}?
                  </Dialog.Title>
                  <Dialog.Description>
                    Gateway {gateway}. Đây là thay đổi cách thu thập dữ liệu,
                    không phải lệnh bật/tắt máy.
                  </Dialog.Description>
                  <dl className="review-list">
                    <div>
                      <dt>Tên thiết bị</dt>
                      <dd>{preview?.deviceName}</dd>
                    </div>
                    <div>
                      <dt>Chu kỳ đọc</dt>
                      <dd>{preview?.samplingIntervalMs} ms</dd>
                    </div>
                    <div>
                      <dt>Slave</dt>
                      <dd>{preview?.slaveId}</dd>
                    </div>
                  </dl>
                  <ul>
                    {preview?.registerMap.map((r) => (
                      <li key={r.key}>
                        {r.key}: địa chỉ {r.address}, {r.dataType}, scale{" "}
                        {r.scale}, đơn vị {r.unit || "không có"}
                      </li>
                    ))}
                  </ul>
                  <Notice>
                    Cấu hình này thay thế bản đang dùng. Kết quả đọc thử:{" "}
                    <span className="mono">{probeId}</span>.
                  </Notice>
                  <div className="dialog-actions">
                    <Dialog.Close asChild>
                      <button>Quay lại</button>
                    </Dialog.Close>
                    <button
                      className="primary"
                      disabled={!ready || busy}
                      onClick={() => {
                        if (!preview || !ready) return;
                        setConfirm(false);
                        void run(
                          async () =>
                            remember(
                              await api.apply(
                                gateway,
                                preview,
                                probeId,
                                acceptWarnings,
                              ),
                            ),
                          true,
                        );
                      }}
                    >
                      Áp dụng cấu hình
                    </button>
                  </div>
                  <Dialog.Close asChild>
                    <button className="dialog-close" aria-label="Đóng">
                      <X size={18} />
                    </button>
                  </Dialog.Close>
                </Dialog.Content>
              </Dialog.Portal>
            </Dialog.Root>
            {running && (
              <button
                className="wide"
                onClick={() => void op.refetch()}
                disabled={op.isFetching}
              >
                Đọc lại trạng thái thao tác
              </button>
            )}
            {applyId && op.data && terminal(op.data) && (
              <button
                className="wide"
                onClick={() => {
                  invalidate();
                  void client.invalidateQueries({ queryKey: ["machines"] });
                  void client.invalidateQueries({ queryKey: ["catalog"] });
                }}
              >
                Bắt đầu lượt cấu hình mới
              </button>
            )}
          </div>
          <div className="surface section">
            <h2>Đối chiếu thao tác</h2>
            <p className="help">
              Nếu request lỗi mạng, kết quả có thể đã tới backend. Kiểm tra mã,
              thời gian và cấu hình trước khi gửi lại.
            </p>
            <button
              disabled={!gateway || history.isFetching}
              onClick={() => {
                setHistoryOpen(true);
                setReviewedOperationId("");
                void history.refetch();
              }}
            >
              Đọc lịch sử gateway
            </button>
            {historyOpen && (
              <>
                <QueryState error={history.error} loading={history.isPending} />
                {history.data?.map((o) => (
                  <div className="operation-history" key={o.id}>
                    <strong>
                      {o.kind === "probe" ? "Đọc thử" : "Áp dụng"} ·{" "}
                      {phaseNames[o.phase]}
                    </strong>
                    <small>{stamp(o.startedAt)}</small>
                    <code>{o.id}</code>
                    <p>
                      Thiết bị: <strong>{o.config.deviceId}</strong> ·{" "}
                      {o.config.deviceName}
                      <br />
                      Gateway: <span className="mono">{o.gatewayId}</span>
                    </p>
                    <p className="help">
                      {preview &&
                      JSON.stringify(o.config) === JSON.stringify(preview)
                        ? "Cấu hình trùng bản đang chuẩn bị."
                        : "Cấu hình khác bản đang chuẩn bị hoặc chưa có bản kiểm tra."}
                    </p>
                    <details>
                      <summary>Xem cấu hình của thao tác</summary>
                      <p className="help">
                        Slave {o.config.slaveId} · {o.config.baudRate} baud ·{" "}
                        {o.config.samplingIntervalMs} ms
                      </p>
                      <pre className="config-snapshot">
                        {JSON.stringify(o.config, null, 2)}
                      </pre>
                    </details>
                    <label className="check">
                      <input
                        type="checkbox"
                        checked={reviewedOperationId === o.id}
                        onChange={(e) =>
                          setReviewedOperationId(e.target.checked ? o.id : "")
                        }
                      />
                      Tôi đã đối chiếu thiết bị, thời gian và cấu hình của thao
                      tác {o.id}.
                    </label>
                    <button
                      disabled={busy || reviewedOperationId !== o.id}
                      onClick={() => {
                        remember(o);
                        setUncertain(false);
                        setError("");
                        void client.invalidateQueries({
                          queryKey: ["operation", o.id],
                        });
                      }}
                    >
                      Theo dõi thao tác này
                    </button>
                  </div>
                ))}
                {history.data?.length === 0 && (
                  <p>
                    Chưa tìm thấy thao tác. Một request đang truyền vẫn có thể
                    xuất hiện sau.
                  </p>
                )}
              </>
            )}
            {(uncertain || op.error) && history.data && (
              <button
                onClick={() => {
                  setUncertain(false);
                  invalidate();
                }}
              >
                Đã đối chiếu; chuẩn bị lại cấu hình
              </button>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
export function OperationResult({ op }: { op: Operation }) {
  const bad = [
    "rejected",
    "timed_out",
    "publish_failed",
    "catalog_error",
  ].includes(op.phase);
  return (
    <div className="operation-result">
      <strong className={bad ? "text-bad" : ""}>{phaseNames[op.phase]}</strong>
      <code>{op.id}</code>
      <p className="help">
        HTTP 202 chỉ là đã tiếp nhận. Theo dõi kết quả cuối từ gateway.
      </p>
      {op.error && <Notice tone="bad">{op.error}</Notice>}
      {op.readings?.map((r) => (
        <div className="probe-row" key={r.key}>
          <span>{r.key}</span>
          <span>
            {r.success
              ? r.value == null
                ? "Không có giá trị"
                : number(r.value)
              : `Lỗi ${r.errorCode}`}
          </span>
          <Badge
            value={
              !r.success
                ? "read_error"
                : r.withinRange === false
                  ? "out_of_range"
                  : "healthy"
            }
          />
        </div>
      ))}
      {op.kind === "apply" && op.phase === "applied" && (
        <>
          <Notice tone={op.persisted ? "ok" : "bad"}>
            {op.persisted
              ? "Đã áp dụng và lưu vào flash."
              : "Đã áp dụng nhưng chưa lưu được vào flash. Có thể mất cấu hình sau khởi động lại."}
          </Notice>
          <p className="help">
            {op.restoredAfterRestart
              ? "Backend đã quan sát khôi phục sau khởi động lại."
              : "Chưa có bằng chứng khôi phục sau khởi động lại trong phản hồi này."}
          </p>
        </>
      )}
    </div>
  );
}

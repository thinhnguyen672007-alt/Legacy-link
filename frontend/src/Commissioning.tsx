import { useEffect, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  FlaskConical,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { controlRequest } from "./api";
import { formatValue, metricName } from "./model";
import type { Catalog } from "./model";
import {
  demoProfile,
  readError,
  terminalOperation,
} from "./commissioning-model";
import type {
  DraftConfig,
  DraftRegister,
  Gateway,
  Operation,
} from "./commissioning-model";
import "./commissioning.css";

const keys = ["temperature", "current", "rpm", "speed", "torque", "pressure"];
const finiteInput = (value: number) => (Number.isFinite(value) ? value : "");
export default function Commissioning({
  base,
  catalog,
  disabled,
  onApplied,
}: {
  base: string;
  catalog: Catalog | null;
  disabled: boolean;
  onApplied: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [startingProfile, setStartingProfile] = useState("A");
  const [draft, setDraft] = useState<DraftConfig>(() => demoProfile("A"));
  const [gateways, setGateways] = useState<Gateway[]>([]);
  const [gatewayId, setGatewayId] = useState("");
  const [gatewayError, setGatewayError] = useState("");
  const [operation, setOperation] = useState<Operation | null>(null);
  const [probe, setProbe] = useState<Operation | null>(null);
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [acceptWarnings, setAcceptWarnings] = useState(false);
  const [now, setNow] = useState(Date.now);
  const startedAt = useRef(Date.now());
  const [setupSeconds, setSetupSeconds] = useState<number | null>(null);
  const [costs, setCosts] = useState(["", "", ""]);
  const form = useRef<HTMLFormElement>(null);
  const abort = useRef<AbortController | null>(null);
  const notified = useRef("");
  const callback = useRef(onApplied);
  callback.current = onApplied;
  const busy = sending || (!!operation && !terminalOperation(operation.phase));
  useEffect(() => () => abort.current?.abort(), []);
  useEffect(() => {
    if (!open || disabled) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function load() {
      try {
        const rows = await controlRequest<Gateway[]>(
          base,
          "/gateways",
          undefined,
          controller.signal,
        );
        if (
          !Array.isArray(rows) ||
          rows.some(
            (g) =>
              typeof g.gatewayId !== "string" || typeof g.online !== "boolean",
          )
        )
          throw new Error(
            "Invalid gateway response. Update the backend control API.",
          );
        if (controller.signal.aborted) return;
        setGateways(rows);
        setGatewayError("");
        setGatewayId(
          (current) => current || rows.find((g) => g.online)?.gatewayId || "",
        );
      } catch (e) {
        if (!controller.signal.aborted)
          setGatewayError(
            e instanceof Error ? e.message : "Cannot load gateways",
          );
      }
      if (!controller.signal.aborted) timer = setTimeout(load, 3000);
    }
    void load();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [base, open, disabled]);
  useEffect(() => {
    if (!open) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [open]);
  useEffect(() => {
    if (!operation?.id) return;
    const id = operation.id;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const result = await controlRequest<Operation>(
          base,
          `/operations/${id}`,
          undefined,
          controller.signal,
        );
        if (controller.signal.aborted) return;
        if (result.id !== id || typeof result.phase !== "string")
          throw new Error("Invalid operation response");
        setOperation(result);
        setError("");
        if (result.kind === "probe" && result.phase === "completed")
          setProbe(result);
        if (
          result.applied &&
          result.phase === "applied" &&
          notified.current !== result.id
        ) {
          notified.current = result.id;
          setSetupSeconds(
            Math.max(0, Math.round((Date.now() - startedAt.current) / 1000)),
          );
          callback.current();
        }
        if (
          result.kind === "apply" &&
          !result.restoredAfterRestart &&
          result.phase === "applied"
        ) {
          timer = setTimeout(poll, 3000);
        } else if (!terminalOperation(result.phase))
          timer = setTimeout(poll, 750);
      } catch (e) {
        if (!controller.signal.aborted) {
          setError(
            `${e instanceof Error ? e.message : "Cannot check operation"}. Device outcome is unverified; reconnect to resume checking.`,
          );
          timer = setTimeout(poll, 3000);
        }
      }
    }
    timer = setTimeout(poll, 500);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [base, operation?.id]);

  function edit(next: DraftConfig) {
    if (operation?.applied) {
      startedAt.current = Date.now();
      setSetupSeconds(null);
    }
    setDraft(next);
    setProbe(null);
    setOperation(null);
    setAcceptWarnings(false);
    setError("");
  }
  function editRegister(index: number, update: Partial<DraftRegister>) {
    edit({
      ...draft,
      registerMap: draft.registerMap.map((r, i) =>
        i === index ? { ...r, ...update } : r,
      ),
    });
  }
  async function send(kind: "probe" | "apply") {
    if (busy || disabled || !form.current?.reportValidity()) return;
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setSending(true);
    setError("");
    if (kind === "probe") {
      setProbe(null);
      setAcceptWarnings(false);
    }
    try {
      const result = await controlRequest<Operation>(
        base,
        `/gateways/${gatewayId}/${kind}`,
        {
          config: draft,
          probeRequestId: probe?.id,
          acceptWarnings,
        },
        controller.signal,
      );
      if (!controller.signal.aborted) setOperation(result);
    } catch (e) {
      if (!controller.signal.aborted)
        setError(
          `${e instanceof Error ? e.message : "Cannot submit request"}. Check the connection and gateway state before retrying.`,
        );
    } finally {
      if (!controller.signal.aborted) setSending(false);
    }
  }
  const selectedGateway = gateways.find((g) => g.gatewayId === gatewayId);
  const online =
    gateways.some((g) => g.gatewayId === gatewayId && g.online) &&
    !gatewayError;
  const passed =
    !!probe?.readings?.length && probe.readings.every((r) => r.success);
  const warnings =
    probe?.readings?.some((r) => r.success && r.withinRange === false) ?? false;
  const expired = !!probe?.finishedAt && now - probe.finishedAt > 60000;
  const canApply =
    passed &&
    !expired &&
    (!warnings || acceptWarnings) &&
    online &&
    !busy &&
    operation?.kind !== "apply";
  const applied = !!operation?.applied;
  return (
    <section className="panel commissioning" aria-labelledby="commission-title">
      <div className="panel-heading">
        <div>
          <h2 id="commission-title">Add or configure a machine</h2>
          <p className="muted">
            Test the register map before making it active.
          </p>
        </div>
        <button
          className="button primary"
          type="button"
          aria-expanded={open}
          disabled={disabled || busy}
          onClick={() => {
            if (!open && !operation?.applied) startedAt.current = Date.now();
            setOpen(!open);
          }}
        >
          {open ? <ChevronDown size={16} /> : <Plus size={16} />}
          {open ? "Close setup" : "Start setup"}
        </button>
      </div>
      {disabled && (
        <p className="commission-note">
          Switch to Live API to configure a real gateway. Sample data cannot
          send commands.
        </p>
      )}
      {open && (
        <form
          ref={form}
          className="commission-body"
          onSubmit={(e) => {
            e.preventDefault();
            void send("probe");
          }}
        >
          <ol className="setup-steps" aria-label="Setup progress">
            <li className={!probe && !applied ? "current" : ""}>Configure</li>
            <li className={probe && !applied ? "current" : ""}>Test read</li>
            <li className={applied ? "current" : ""}>Apply & verify</li>
          </ol>
          {gatewayError && (
            <p role="alert" className="notice danger">
              {gatewayError}
            </p>
          )}
          {!gateways.length && !gatewayError && (
            <p className="notice">
              Waiting for an ESP32 gateway. Start the updated firmware and check
              its Wi-Fi, MQTT and clock synchronization.
            </p>
          )}
          <fieldset disabled={busy} className="setup-fields">
            <legend>Gateway and machine</legend>
            <div className="setup-grid">
              <label>
                Gateway
                <select
                  required
                  value={gatewayId}
                  onChange={(e) => {
                    setGatewayId(e.target.value);
                    edit(draft);
                  }}
                >
                  <option value="">Select a gateway</option>
                  {gateways.map((g) => (
                    <option
                      key={g.gatewayId}
                      value={g.gatewayId}
                      disabled={!g.online}
                    >
                      {g.gatewayId} ·{" "}
                      {g.online ? "Online" : "No recent contact"}
                      {g.deviceId ? ` · ${g.deviceId}` : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Starting profile
                <select
                  value={startingProfile}
                  onChange={(e) => {
                    setStartingProfile(e.target.value);
                    edit(
                      e.target.value === "current" && catalog
                        ? structuredClone(catalog)
                        : demoProfile(e.target.value as "A" | "B"),
                    );
                  }}
                >
                  <option value="A">Demo A · temperature at 0</option>
                  <option value="B">Demo B · temperature at 49</option>
                  {catalog && (
                    <option value="current">
                      Current catalog · {catalog.deviceId}
                    </option>
                  )}
                </select>
              </label>
              <label>
                Machine ID
                <input
                  required
                  maxLength={31}
                  pattern="[A-Za-z0-9_\-]+"
                  value={draft.deviceId}
                  onChange={(e) => edit({ ...draft, deviceId: e.target.value })}
                />
              </label>
              <label>
                Machine name
                <input
                  required
                  value={draft.deviceName}
                  onChange={(e) =>
                    edit({ ...draft, deviceName: e.target.value })
                  }
                />
              </label>
            </div>
            {selectedGateway && (
              <details className="gateway-evidence">
                <summary>
                  Current gateway ·{" "}
                  {selectedGateway.online ? "reporting" : "no recent contact"}
                </summary>
                <p>
                  Active machine:{" "}
                  <strong>
                    {selectedGateway.deviceId || "Not configured"}
                  </strong>
                  . Flash:{" "}
                  {selectedGateway.persisted ? "saved" : "not confirmed"}.
                  Restored at this boot:{" "}
                  {selectedGateway.restored ? "yes" : "no"}.
                </p>
                <p className="muted">
                  Active request{" "}
                  <code>
                    {selectedGateway.configRequestId ||
                      "legacy / manual configuration"}
                  </code>
                </p>
              </details>
            )}
            <details className="serial-settings">
              <summary>
                Serial settings · {draft.baudRate} baud / {draft.parity} / slave{" "}
                {draft.slaveId}
              </summary>
              <div className="setup-grid">
                <label>
                  Baud rate
                  <input
                    type="number"
                    required
                    min={300}
                    max={2000000}
                    value={finiteInput(draft.baudRate)}
                    onChange={(e) =>
                      edit({ ...draft, baudRate: e.target.valueAsNumber })
                    }
                  />
                </label>
                <label>
                  Parity
                  <select
                    value={draft.parity}
                    onChange={(e) => edit({ ...draft, parity: e.target.value })}
                  >
                    {["NONE", "EVEN", "ODD"].map((v) => (
                      <option key={v}>{v}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Stop bits
                  <select
                    value={draft.stopBits}
                    onChange={(e) =>
                      edit({ ...draft, stopBits: +e.target.value })
                    }
                  >
                    <option>1</option>
                    <option>2</option>
                  </select>
                </label>
                <label>
                  Slave ID
                  <input
                    required
                    type="number"
                    min={1}
                    max={247}
                    value={finiteInput(draft.slaveId)}
                    onChange={(e) =>
                      edit({ ...draft, slaveId: e.target.valueAsNumber })
                    }
                  />
                </label>
                <label>
                  Sampling interval (ms)
                  <input
                    required
                    type="number"
                    min={100}
                    max={86400000}
                    value={finiteInput(draft.samplingIntervalMs)}
                    onChange={(e) =>
                      edit({
                        ...draft,
                        samplingIntervalMs: e.target.valueAsNumber,
                      })
                    }
                  />
                </label>
              </div>
            </details>
            <div className="register-editor-heading">
              <h3>Register map</h3>
              <button
                className="button"
                type="button"
                disabled={draft.registerMap.length >= keys.length}
                onClick={() => {
                  const key = keys.find(
                    (k) => !draft.registerMap.some((r) => r.key === k),
                  )!;
                  edit({
                    ...draft,
                    registerMap: [
                      ...draft.registerMap,
                      {
                        key,
                        address: 0,
                        functionCode: 3,
                        dataType: "INT16",
                        scale: 1,
                        unit: "",
                      },
                    ],
                  });
                }}
              >
                <Plus size={16} />
                Add metric
              </button>
            </div>
            <p className="muted">
              Use raw, zero-based addresses: holding register 40001 is address
              0. Demo profiles require matching registers in your simulator.
            </p>
            {draft.registerMap.map((reg, index) => (
              <fieldset className="register-editor" key={index}>
                <legend>{metricName(reg.key)}</legend>
                <div className="setup-grid register-fields">
                  <label>
                    Metric
                    <select
                      aria-label={`Metric ${index + 1}`}
                      value={reg.key}
                      onChange={(e) =>
                        editRegister(index, { key: e.target.value })
                      }
                    >
                      {keys.map((k) => (
                        <option
                          key={k}
                          disabled={draft.registerMap.some(
                            (r, i) => i !== index && r.key === k,
                          )}
                        >
                          {k}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Raw address
                    <input
                      required
                      type="number"
                      min={0}
                      max={reg.dataType === "UINT32" ? 65534 : 65535}
                      aria-label={`${reg.key} raw address`}
                      value={finiteInput(reg.address)}
                      onChange={(e) =>
                        editRegister(index, { address: e.target.valueAsNumber })
                      }
                    />
                  </label>
                  <label>
                    Function
                    <select
                      aria-label={`${reg.key} function`}
                      value={reg.functionCode}
                      onChange={(e) =>
                        editRegister(index, {
                          functionCode: +e.target.value as 3 | 4,
                        })
                      }
                    >
                      <option value={3}>03 · Holding</option>
                      <option value={4}>04 · Input</option>
                    </select>
                  </label>
                  <label>
                    Data type
                    <select
                      aria-label={`${reg.key} data type`}
                      value={reg.dataType}
                      onChange={(e) =>
                        editRegister(index, { dataType: e.target.value })
                      }
                    >
                      {["INT16", "UINT16", "UINT32"].map((v) => (
                        <option key={v}>{v}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Scale
                    <input
                      required
                      type="number"
                      step="any"
                      aria-label={`${reg.key} scale`}
                      value={finiteInput(reg.scale)}
                      onChange={(e) =>
                        editRegister(index, { scale: e.target.valueAsNumber })
                      }
                    />
                  </label>
                  <label>
                    Unit
                    <input
                      aria-label={`${reg.key} unit`}
                      value={reg.unit}
                      onChange={(e) =>
                        editRegister(index, { unit: e.target.value })
                      }
                    />
                  </label>
                  {reg.dataType === "UINT32" && (
                    <label>
                      Word order
                      <select
                        aria-label={`${reg.key} word order`}
                        value={reg.wordOrder || "HIGH_FIRST"}
                        onChange={(e) =>
                          editRegister(index, {
                            wordOrder: e.target
                              .value as DraftRegister["wordOrder"],
                          })
                        }
                      >
                        <option value="HIGH_FIRST">High word first</option>
                        <option value="LOW_FIRST">Low word first</option>
                      </select>
                    </label>
                  )}
                </div>
                <details>
                  <summary>Expected range & alarm</summary>
                  <div className="setup-grid">
                    <label>
                      Expected minimum
                      <input
                        type="number"
                        step="any"
                        aria-label={`${reg.key} expected minimum`}
                        value={reg.expectedMin ?? ""}
                        onChange={(e) =>
                          editRegister(index, {
                            expectedMin:
                              e.target.value === ""
                                ? undefined
                                : e.target.valueAsNumber,
                          })
                        }
                      />
                    </label>
                    <label>
                      Expected maximum
                      <input
                        type="number"
                        step="any"
                        aria-label={`${reg.key} expected maximum`}
                        value={reg.expectedMax ?? ""}
                        onChange={(e) =>
                          editRegister(index, {
                            expectedMax:
                              e.target.value === ""
                                ? undefined
                                : e.target.valueAsNumber,
                          })
                        }
                      />
                    </label>
                    <label>
                      High alarm threshold
                      <input
                        type="number"
                        step="any"
                        aria-label={`${reg.key} alarm threshold`}
                        value={reg.alarm?.threshold ?? ""}
                        onChange={(e) =>
                          editRegister(index, {
                            alarm:
                              e.target.value === ""
                                ? undefined
                                : {
                                    threshold: e.target.valueAsNumber,
                                    hysteresis: reg.alarm?.hysteresis ?? 0,
                                    code:
                                      reg.alarm?.code ??
                                      (reg.key === "temperature"
                                        ? "OVERHEAT"
                                        : reg.key === "current"
                                          ? "OVERCURRENT"
                                          : "OVERSPEED"),
                                    severity: reg.alarm?.severity ?? "high",
                                  },
                          })
                        }
                      />
                    </label>
                    {reg.alarm && (
                      <>
                        <label>
                          Alarm code
                          <select
                            aria-label={`${reg.key} alarm code`}
                            value={reg.alarm.code}
                            onChange={(e) =>
                              editRegister(index, {
                                alarm: { ...reg.alarm!, code: e.target.value },
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
                          Severity
                          <select
                            aria-label={`${reg.key} alarm severity`}
                            value={reg.alarm.severity}
                            onChange={(e) =>
                              editRegister(index, {
                                alarm: {
                                  ...reg.alarm!,
                                  severity: e.target.value,
                                },
                              })
                            }
                          >
                            {["low", "medium", "high", "critical"].map((v) => (
                              <option key={v}>{v}</option>
                            ))}
                          </select>
                        </label>
                        <label>
                          Hysteresis
                          <input
                            type="number"
                            required
                            min={0}
                            step="any"
                            aria-label={`${reg.key} hysteresis`}
                            value={finiteInput(reg.alarm.hysteresis)}
                            onChange={(e) =>
                              editRegister(index, {
                                alarm: {
                                  ...reg.alarm!,
                                  hysteresis: e.target.valueAsNumber,
                                },
                              })
                            }
                          />
                        </label>
                      </>
                    )}
                  </div>
                  <p className="muted">
                    Expected ranges flag suspicious values; they do not prove
                    the register map is correct. Alarm thresholds are separate
                    settings.
                  </p>
                </details>
                <button
                  className="text-button remove-metric"
                  type="button"
                  disabled={draft.registerMap.length === 1}
                  aria-label={`Remove ${reg.key}`}
                  onClick={() =>
                    edit({
                      ...draft,
                      registerMap: draft.registerMap.filter(
                        (_, i) => i !== index,
                      ),
                    })
                  }
                >
                  <Trash2 size={14} />
                  Remove metric
                </button>
              </fieldset>
            ))}
          </fieldset>
          {error && (
            <p className="notice danger" role="alert">
              {error}
            </p>
          )}
          {operation?.error && (
            <p className="notice danger" role="alert">
              {operation.error}
            </p>
          )}
          <div className="setup-actions">
            <button
              className="button primary"
              type="submit"
              disabled={busy || !online}
            >
              <FlaskConical size={17} />
              {busy && operation?.kind !== "apply"
                ? "Reading from ESP32…"
                : "Test read"}
            </button>
            <span className="muted">
              Polling pauses briefly during the test. Your active map is
              restored afterwards.
            </span>
          </div>
          {probe?.readings && (
            <section
              className="probe-results"
              aria-labelledby="probe-results-title"
            >
              <h3 id="probe-results-title">Read from ESP32</h3>
              <p className="muted">
                {expired
                  ? "This test expired. Read again before applying."
                  : "Apply within 60 seconds. Editing the draft requires another test."}
              </p>
              <div
                className="table-scroll"
                role="region"
                aria-label="Test read results"
                tabIndex={0}
              >
                <table>
                  <thead>
                    <tr>
                      <th>Metric / address</th>
                      <th>Raw words</th>
                      <th>Decoded raw</th>
                      <th>Converted</th>
                      <th>Check</th>
                    </tr>
                  </thead>
                  <tbody>
                    {probe.readings.map((row) => {
                      const reg = draft.registerMap.find(
                        (r) => r.key === row.key,
                      );
                      return (
                        <tr key={row.key}>
                          <th scope="row">
                            {metricName(row.key)}
                            <code>{row.address}</code>
                          </th>
                          <td>
                            <code>{row.rawWords?.join(", ") ?? "—"}</code>
                          </td>
                          <td>
                            <code>
                              {row.rawValue == null
                                ? "—"
                                : formatValue(row.rawValue)}
                            </code>
                          </td>
                          <td>
                            <strong>
                              {row.value == null ? "—" : formatValue(row.value)}{" "}
                              {reg?.unit}
                            </strong>
                          </td>
                          <td
                            className={
                              !row.success || !row.withinRange
                                ? "read-failed"
                                : ""
                            }
                          >
                            {!row.success
                              ? readError(row.errorCode)
                              : row.withinRange === false
                                ? "Outside expected range"
                                : reg?.expectedMin == null &&
                                    reg?.expectedMax == null
                                  ? "Responded · no range set"
                                  : "Within expected range"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {warnings && (
                <label className="range-confirm">
                  <input
                    type="checkbox"
                    checked={acceptWarnings}
                    onChange={(e) => setAcceptWarnings(e.target.checked)}
                  />
                  I reviewed the out-of-range values and want to use this
                  configuration.
                </label>
              )}
              <button
                className="button primary"
                type="button"
                disabled={!canApply}
                onClick={() => void send("apply")}
              >
                <Check size={17} />
                Apply tested configuration
              </button>
            </section>
          )}
          {operation && (
            <section
              className="operation-evidence"
              aria-live="polite"
              aria-labelledby="evidence-title"
            >
              <h3 id="evidence-title">
                {operation.kind === "probe"
                  ? "Test progress"
                  : "Configuration evidence"}
              </h3>
              <p>
                {busy && <RefreshCw size={14} className="spin" />}{" "}
                {operation.phase.replaceAll("_", " ")}
              </p>
              {operation.kind === "apply" && (
                <>
                  <ol className="evidence-list">
                    <li>
                      {operation.received ? "Confirmed" : "Waiting"} · received
                      by ESP32
                    </li>
                    <li>
                      {applied ? "Confirmed" : "Waiting"} · applied on ESP32
                    </li>
                    <li>
                      {operation.persisted
                        ? "Confirmed"
                        : applied
                          ? "Not confirmed"
                          : "Waiting"}{" "}
                      · saved to flash
                    </li>
                    <li>
                      {operation.restoredAfterRestart ? "Confirmed" : "Waiting"}{" "}
                      · restored after restart
                    </li>
                  </ol>
                  {applied && (
                    <p>
                      Setup time:{" "}
                      {setupSeconds ??
                        Math.max(
                          0,
                          Math.round((now - startedAt.current) / 1000),
                        )}{" "}
                      s.{" "}
                      {operation.restoredAfterRestart
                        ? "The gateway reported a new boot with this same configuration."
                        : "Restart the ESP32 with EN to verify restoration. This step remains pending until the gateway reports it."}
                    </p>
                  )}
                </>
              )}
              <p className="muted">
                Request <code>{operation.id}</code>
              </p>
            </section>
          )}
          <details className="hardware-cost">
            <summary>Demo hardware cost</summary>
            <p className="muted">
              Enter your actual purchase prices in VND. The bench uses an ESP32
              and USB–TTL adapter; include any extra parts separately.
            </p>
            <div className="setup-grid">
              {[
                "ESP32 cost (VND)",
                "USB–TTL cost (VND)",
                "Other hardware cost (VND)",
              ].map((label, index) => (
                <label key={label}>
                  {label}
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={costs[index]}
                    onChange={(e) =>
                      setCosts(
                        costs.map((v, i) => (i === index ? e.target.value : v)),
                      )
                    }
                  />
                </label>
              ))}
            </div>
            <p>
              <strong>
                {costs[0] !== "" &&
                costs[1] !== "" &&
                costs.every(
                  (v) =>
                    v === "" || (Number.isFinite(Number(v)) && Number(v) >= 0),
                )
                  ? `Total: ${new Intl.NumberFormat("en-US").format(costs.reduce((sum, v) => sum + Number(v || 0), 0))} VND`
                  : "Enter ESP32 and adapter prices to calculate the total."}
              </strong>
            </p>
          </details>
        </form>
      )}
    </section>
  );
}

import { useEffect, useMemo, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import {
  Activity,
  ArrowDownToLine,
  ArrowRight,
  Cable,
  Check,
  ChevronRight,
  CircleHelp,
  Clock3,
  Cpu,
  Database,
  Gauge,
  LayoutDashboard,
  Link2,
  ListFilter,
  Network,
  Pause,
  Play,
  Radio,
  RefreshCw,
  Search,
  Server,
  Settings2,
  SlidersHorizontal,
  Thermometer,
  Unplug,
  Wifi,
  Zap,
} from "lucide-react";
import { readSavedAddress } from "./api";
import {
  formatValue,
  machineState,
  metricName,
  modiconReference,
  normalizeBaseUrl,
  relativeTime,
  STATE_LABELS,
} from "./model";
import type { Catalog, Machine, MachineState } from "./model";
import { useCatalog, useMachines } from "./useGateway";
import type { Mode } from "./useGateway";

type Page = "overview" | "registers" | "connection";
function currentPage(): Page {
  const hash = window.location.hash.slice(1);
  return hash === "registers" || hash === "connection" ? hash : "overview";
}
function Badge({
  state,
  cached = false,
}: {
  state: MachineState;
  cached?: boolean;
}) {
  return (
    <span className={`badge ${cached ? "quiet" : state}`}>
      <span className="status-dot" />
      {cached ? "Unverified" : STATE_LABELS[state]}
    </span>
  );
}
function Notice({
  children,
  danger = false,
}: {
  children: ReactNode;
  danger?: boolean;
}) {
  return (
    <div
      className={`notice ${danger ? "danger" : ""}`}
      role={danger ? "alert" : undefined}
    >
      <CircleHelp size={18} aria-hidden="true" />
      <div>{children}</div>
    </div>
  );
}
function RegisterTable({
  catalog,
  metrics,
  stored = false,
}: {
  stored?: boolean;
  catalog: Catalog;
  metrics?: Machine["metrics"];
}) {
  return (
    <div
      className="table-scroll"
      role="region"
      aria-label="Modbus register map"
      tabIndex={0}
    >
      <table className="register-table">
        <caption className="sr-only">
          Configured registers from the backend catalog. Measurement values are
          already scaled.
        </caption>
        <thead>
          <tr>
            <th>Metric</th>
            <th>Raw address</th>
            <th>Modicon¹</th>
            <th>Function</th>
            <th>Data type</th>
            <th>Scale</th>
            <th>{stored ? "Last stored value" : "Latest reported value"}</th>
          </tr>
        </thead>
        <tbody>
          {catalog.registerMap.map((reg) => (
            <tr key={reg.key}>
              <th scope="row">
                <span>{metricName(reg.key)}</span>
                <code>{reg.key}</code>
              </th>
              <td className="numeric">{reg.address}</td>
              <td className="numeric muted">{modiconReference(reg)}</td>
              <td>FC0{reg.functionCode}</td>
              <td>
                <code className="type-tag">{reg.dataType}</code>
              </td>
              <td className="numeric">× {reg.scale}</td>
              <td className="numeric">
                {formatValue(metrics?.[reg.key])}{" "}
                <span className="muted">
                  {reg.unit === "C" ? "°C" : reg.unit}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!catalog.registerMap.length && (
        <p className="table-empty">
          No registers are configured for this device.
        </p>
      )}
    </div>
  );
}
function exportCatalog(catalog: Catalog) {
  const blob = new Blob([JSON.stringify(catalog, null, 2) + "\n"], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${catalog.deviceId.replace(/[^a-zA-Z0-9_-]/g, "_")}-catalog.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function MetricIcon({ metric }: { metric: string }) {
  return metric === "temperature" ? (
    <Thermometer />
  ) : metric === "current" ? (
    <Zap />
  ) : ["rpm", "speed"].includes(metric) ? (
    <Gauge />
  ) : (
    <Activity />
  );
}
export default function App() {
  const [page, setPage] = useState<Page>(currentPage);
  const [base, setBase] = useState(readSavedAddress);
  const [draft, setDraft] = useState(base);
  const [addressError, setAddressError] = useState("");
  const [saved, setSaved] = useState("");
  const [mode, setMode] = useState<Mode>("live");
  const [paused, setPaused] = useState(false);
  const [selectedId, setSelectedId] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [clock, setNow] = useState(Date.now);
  const feed = useMachines(base, mode, paused);
  const now = mode === "sample" ? (feed.lastFetch ?? clock) : clock;
  const selected =
    feed.machines.find((m) => m.deviceId === selectedId) ?? feed.machines[0];
  const config = useCatalog(base, mode, selected?.deviceId);
  const cached = Boolean(feed.error) || paused;
  useEffect(() => {
    const onHash = () => {
      if (location.hash !== "#main-content") setPage(currentPage());
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    document.title = `Legacy-link · ${page === "overview" ? "Machine overview" : page === "registers" ? "Register maps" : "Connection"}`;
  }, [page]);
  const counts = useMemo(() => {
    const result = { online: 0, offline: 0, attention: 0 };
    feed.machines.forEach((m) => {
      const s = machineState(m, now);
      if (s === "online") result.online++;
      else if (s === "offline") result.offline++;
      else result.attention++;
    });
    return result;
  }, [feed.machines, now]);
  const filtered = feed.machines.filter((m) => {
    const state = machineState(m, now);
    const text = `${m.deviceId} ${m.name} ${m.machineType}`.toLowerCase();
    return (
      text.includes(query.toLowerCase()) &&
      (filter === "all" ||
        (filter === "attention"
          ? !["online", "offline"].includes(state)
          : state === filter))
    );
  });
  function changeMode(next: Mode) {
    setMode(next);
    setSelectedId("");
    setPaused(false);
    setQuery("");
    setFilter("all");
  }
  function saveConnection(event: FormEvent) {
    event.preventDefault();
    setAddressError("");
    setSaved("");
    try {
      const value = normalizeBaseUrl(draft);
      if (location.protocol === "https:" && value.startsWith("http:"))
        throw new Error(
          "This page uses HTTPS. Use an HTTPS backend or open the frontend over HTTP on your local network.",
        );
      try {
        localStorage.setItem("legacy-link.api", value);
        setSaved("Address saved on this browser. Connecting…");
      } catch {
        setSaved(
          "Address applied for this session. Your browser did not allow saving it.",
        );
      }
      setBase(value);
      setDraft(value);
      changeMode("live");
      feed.refresh();
    } catch (error) {
      setAddressError(
        error instanceof Error ? error.message : "Invalid address.",
      );
    }
  }
  const selectedState = selected ? machineState(selected, now) : null;
  const readingWarning = cached
    ? "Snapshot only. Current readings cannot be verified."
    : selectedState === "offline"
      ? "Gateway is offline. These are the last stored readings."
      : selectedState === "quiet"
        ? "No recent backend contact. These readings may be out of date."
        : selectedState === "clock"
          ? "The backend timestamp is in the future. Check the device and server clocks."
          : selectedState === "waiting"
            ? "This device has not reported measurements yet."
            : "";
  const metrics = selected?.metrics ? Object.entries(selected.metrics) : [];
  const isConnected = feed.lastFetch !== null && !feed.error && mode === "live";
  const showCatalog = () =>
    config.loading ? (
      <div className="skeleton-lines" aria-label="Loading register map">
        <i />
        <i />
        <i />
      </div>
    ) : config.error ? (
      <Notice danger>
        {config.error}{" "}
        <button className="text-button" onClick={config.refresh}>
          Try again
        </button>
      </Notice>
    ) : config.catalog ? (
      <>
        {readingWarning && (
          <div className="catalog-warning">
            <Badge state={selectedState ?? "waiting"} cached={cached} />
            <p className="data-caution">
              <Clock3 size={15} />
              {readingWarning}
            </p>
          </div>
        )}
        <RegisterTable
          catalog={config.catalog}
          metrics={selected?.metrics}
          stored={!!readingWarning}
        />
        <p className="table-note">
          ¹ Conventional reference calculated from the raw address. ESP32 uses
          the raw address; values above are already scaled.
        </p>
      </>
    ) : (
      <p className="table-empty">
        Select a machine to inspect its register map.
      </p>
    );

  return (
    <div className="app-shell">
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      <aside className="sidebar">
        <a className="brand" href="#overview" aria-label="Legacy-link overview">
          <span className="brand-mark">
            <Link2 size={23} />
          </span>
          <span>
            legacy<span className="brand-divider">/</span>link
            <span className="brand-caption">MACHINE CONNECTIVITY</span>
          </span>
        </a>
        <div className="workspace">
          <span className="workspace-symbol">
            <Network size={18} />
          </span>
          <div>
            <strong>Factory workspace</strong>
            <span>DENSO · D1</span>
          </div>
        </div>
        <nav aria-label="Main navigation">
          <a
            href="#overview"
            className={page === "overview" ? "active" : ""}
            aria-current={page === "overview" ? "page" : undefined}
          >
            <LayoutDashboard size={19} />
            Overview
            <span className="nav-count">{feed.machines.length || "—"}</span>
          </a>
          <a
            href="#registers"
            className={page === "registers" ? "active" : ""}
            aria-current={page === "registers" ? "page" : undefined}
          >
            <SlidersHorizontal size={19} />
            Register maps
          </a>
          <a
            href="#connection"
            className={page === "connection" ? "active" : ""}
            aria-current={page === "connection" ? "page" : undefined}
          >
            <Cable size={19} />
            Connection
          </a>
        </nav>
        <div className="sidebar-bottom">
          <div className="side-note">
            <Cpu size={22} />
            <strong>Built for legacy machines.</strong>
            <p>
              Read the registers.
              <br />
              Make the data useful.
            </p>
          </div>
          <div className="sidebar-footer">
            <span className="tiny-mark">LL</span>
            <div>
              Legacy-link<span>Hackathon workspace</span>
            </div>
            <span className="version">0.1</span>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumbs">
            Workspace
            <ChevronRight size={14} />
            <strong>
              {page === "overview"
                ? "Overview"
                : page === "registers"
                  ? "Register maps"
                  : "Connection"}
            </strong>
          </div>
          <div className="topbar-right">
            <span
              className={`connection-indicator ${isConnected ? "connected" : ""}`}
            >
              <span className="status-dot" />
              {mode === "sample"
                ? "Sample data"
                : isConnected
                  ? paused
                    ? "Updates paused"
                    : "API connected"
                  : feed.loading
                    ? "Connecting"
                    : "API unavailable"}
            </span>
            <a
              className="icon-button"
              href="#connection"
              aria-label="Connection settings"
            >
              <Settings2 size={18} />
            </a>
          </div>
        </header>
        <main id="main-content" tabIndex={-1}>
          <div className="page-heading">
            <div>
              <h1>
                {page === "overview"
                  ? "Machine overview"
                  : page === "registers"
                    ? "Register maps"
                    : "Connection"}
              </h1>
              <p>
                {page === "overview"
                  ? "A clear view of your machines, from register to reading."
                  : page === "registers"
                    ? "Understand exactly where each measurement comes from."
                    : "Connect this workspace to your team’s backend."}
              </p>
            </div>
            <div className="heading-actions">
              <div className="segmented" aria-label="Data source">
                <button
                  aria-pressed={mode === "live"}
                  className={mode === "live" ? "selected" : ""}
                  onClick={() => changeMode("live")}
                >
                  Live API
                </button>
                <button
                  aria-pressed={mode === "sample"}
                  className={mode === "sample" ? "selected" : ""}
                  onClick={() => changeMode("sample")}
                >
                  Sample
                </button>
              </div>
              <button
                className="button"
                onClick={() => {
                  feed.refresh();
                  config.refresh();
                }}
                disabled={feed.loading}
              >
                <RefreshCw
                  size={16}
                  className={feed.loading ? "spinning" : ""}
                />
                Refresh
              </button>
            </div>
          </div>
          {mode === "sample" && (
            <div className="sample-banner">
              <span>
                <Radio size={17} />
                <strong>Sample workspace</strong>Illustrative values for
                interface review. No hardware or backend connection.
              </span>
              <button
                className="text-button"
                onClick={() => changeMode("live")}
              >
                Return to live <ArrowRight size={15} />
              </button>
            </div>
          )}
          {mode === "live" && feed.error && (
            <Notice danger>
              <strong>Backend connection unavailable.</strong> {feed.error}
              {feed.machines.length > 0 &&
                " Last successful readings are shown below; their current state is unverified."}{" "}
              <a href="#connection">Check connection</a>
            </Notice>
          )}
          {paused && mode === "live" && (
            <Notice>
              Automatic updates are paused. Displayed readings are a snapshot.{" "}
              <button className="text-button" onClick={() => setPaused(false)}>
                Resume updates
              </button>
            </Notice>
          )}

          {page === "overview" && (
            <>
              <section className="summary" aria-label="Fleet summary">
                <div>
                  <span>Registered machines</span>
                  <strong>
                    {feed.lastFetch === null
                      ? "—"
                      : feed.machines.length.toString().padStart(2, "0")}
                  </strong>
                  <Cpu size={20} />
                </div>
                <div>
                  <span>
                    <i className="dot green" />
                    Online{cached ? " (last known)" : ""}
                  </span>
                  <strong>
                    {feed.lastFetch === null
                      ? "—"
                      : counts.online.toString().padStart(2, "0")}
                  </strong>
                  <span className="summary-note">Gateway reporting</span>
                </div>
                <div>
                  <span>
                    <i className="dot amber" />
                    Needs attention{cached ? " (last known)" : ""}
                  </span>
                  <strong>
                    {feed.lastFetch === null
                      ? "—"
                      : counts.attention.toString().padStart(2, "0")}
                  </strong>
                  <span className="summary-note">
                    No recent contact or data
                  </span>
                </div>
                <div>
                  <span>
                    <i className="dot gray" />
                    Offline{cached ? " (last known)" : ""}
                  </span>
                  <strong>
                    {feed.lastFetch === null
                      ? "—"
                      : counts.offline.toString().padStart(2, "0")}
                  </strong>
                  <span className="summary-note">
                    Last reported disconnected
                  </span>
                </div>
              </section>
              <section
                className="panel fleet-panel"
                aria-labelledby="fleet-title"
              >
                <div className="panel-heading">
                  <div className="section-title">
                    <h2 id="fleet-title">Your machines</h2>
                    <span className="count-label">{feed.machines.length}</span>
                  </div>
                  <div className="polling-control">
                    <span>
                      {mode === "sample"
                        ? "Static preview"
                        : "Refresh every 2s"}
                    </span>
                    <button
                      className="icon-button"
                      aria-label={
                        paused
                          ? "Resume automatic updates"
                          : "Pause automatic updates"
                      }
                      onClick={() => setPaused(!paused)}
                      disabled={mode === "sample"}
                    >
                      {paused ? <Play size={15} /> : <Pause size={15} />}
                    </button>
                  </div>
                </div>
                <div className="table-toolbar">
                  <label className="search-field">
                    <Search size={17} />
                    <span className="sr-only">Search machines</span>
                    <input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Search name, ID or machine type…"
                      type="search"
                    />
                  </label>
                  <label className="filter-field">
                    <ListFilter size={17} />
                    <span className="sr-only">Filter by state</span>
                    <select
                      value={filter}
                      onChange={(e) => setFilter(e.target.value)}
                    >
                      <option value="all">All states</option>
                      <option value="online">Online</option>
                      <option value="attention">Needs attention</option>
                      <option value="offline">Offline</option>
                    </select>
                  </label>
                </div>
                {feed.loading && !feed.lastFetch ? (
                  <div
                    className="skeleton-lines"
                    role="status"
                    aria-label="Loading machines"
                  >
                    <i />
                    <i />
                    <i />
                  </div>
                ) : feed.machines.length === 0 ? (
                  <div className="empty-state">
                    <Unplug size={32} />
                    <h3>
                      {feed.error
                        ? "Let’s connect your machines"
                        : "No machines registered yet"}
                    </h3>
                    <p>
                      {feed.error
                        ? "Add the HTTP address of the backend on your local network to see real readings."
                        : "Devices appear here once they are added to the backend catalog. An ESP32 sending data alone does not register a machine."}
                    </p>
                    <a className="button primary" href="#connection">
                      Set up connection
                      <ArrowRight size={16} />
                    </a>
                    <button
                      className="text-button"
                      onClick={() => changeMode("sample")}
                    >
                      Explore the sample workspace
                    </button>
                  </div>
                ) : (
                  <>
                    <div
                      className="table-scroll"
                      role="region"
                      aria-label="Machines"
                      tabIndex={0}
                    >
                      <table className="machine-table">
                        <thead>
                          <tr>
                            <th>Machine</th>
                            <th>Gateway state</th>
                            <th>Measurements</th>
                            <th>Last contact</th>
                            <th>
                              <span className="sr-only">Selection</span>
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {filtered.map((m) => (
                            <tr
                              key={m.deviceId}
                              className={
                                selected?.deviceId === m.deviceId
                                  ? "selected-row"
                                  : ""
                              }
                            >
                              <th scope="row">
                                <button
                                  className="machine-select"
                                  aria-pressed={
                                    selected?.deviceId === m.deviceId
                                  }
                                  onClick={() => setSelectedId(m.deviceId)}
                                >
                                  <span className="machine-symbol">
                                    <Cpu size={20} />
                                  </span>
                                  <span>
                                    <strong>{m.name}</strong>
                                    <code>{m.deviceId}</code>
                                    <small className="mobile-contact">
                                      {relativeTime(m.lastSeenAt, now)}
                                    </small>
                                  </span>
                                </button>
                              </th>
                              <td>
                                <Badge
                                  state={machineState(m, now)}
                                  cached={cached}
                                />
                              </td>
                              <td>
                                <span className="metric-count">
                                  {m.metrics && Object.keys(m.metrics).length
                                    ? `${Object.keys(m.metrics).length} readings`
                                    : "No readings"}
                                </span>
                                <small>{m.machineType}</small>
                              </td>
                              <td>
                                <span
                                  title={
                                    m.lastSeenAt
                                      ? new Date(m.lastSeenAt).toLocaleString()
                                      : undefined
                                  }
                                >
                                  {relativeTime(m.lastSeenAt, now)}
                                </span>
                              </td>
                              <td>
                                {selected?.deviceId === m.deviceId ? (
                                  <Check
                                    className="selection-check"
                                    size={18}
                                    aria-label="Selected"
                                  />
                                ) : (
                                  <ChevronRight size={18} aria-hidden="true" />
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {!filtered.length && (
                      <div className="table-empty">
                        No machines match your filters.{" "}
                        <button
                          className="text-button"
                          onClick={() => {
                            setQuery("");
                            setFilter("all");
                          }}
                        >
                          Clear filters
                        </button>
                      </div>
                    )}
                  </>
                )}
                <div className="table-footer">
                  <span>
                    {filtered.length} of {feed.machines.length} machines
                  </span>
                  <span>
                    <Clock3 size={13} />
                    {feed.lastFetch
                      ? `Fetched ${relativeTime(new Date(feed.lastFetch).toISOString(), now)}`
                      : "Waiting for the first response"}
                  </span>
                </div>
              </section>
              {selected && (
                <section
                  className="detail-section"
                  aria-labelledby="readings-title"
                >
                  <div className="detail-heading">
                    <div>
                      <h2 id="readings-title">
                        {selected.name}
                        <span className="muted"> / Latest measurements</span>
                      </h2>
                      <p>
                        <code>{selected.deviceId}</code>
                        <span className="separator">·</span>Values reported by
                        the gateway
                      </p>
                    </div>
                    <a className="text-button" href="#registers">
                      Inspect register map <ArrowRight size={16} />
                    </a>
                  </div>
                  {selectedState !== "online" || cached ? (
                    <p className="data-caution">
                      <Clock3 size={15} />
                      {readingWarning}
                    </p>
                  ) : null}
                  {metrics.length ? (
                    <div
                      className={`readings-grid ${selectedState !== "online" || cached ? "readings-inactive" : ""}`}
                    >
                      {metrics.map(([key, value]) => {
                        const reg = config.catalog?.registerMap.find(
                          (r) => r.key === key,
                        );
                        return (
                          <article className="reading" key={key}>
                            <div className="reading-label">
                              <span>{metricName(key)}</span>
                              <MetricIcon metric={key} />
                            </div>
                            <div className="reading-value">
                              {formatValue(value)}
                              <span>
                                {reg?.unit === "C" ? "°C" : reg?.unit || ""}
                              </span>
                            </div>
                            <div className="reading-source">
                              <span className="status-dot" />
                              {reg
                                ? `Register ${reg.address} · ${reg.dataType}`
                                : "Reported measurement"}
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="panel empty-readings">
                      <Activity size={24} />
                      <p>
                        Measurements will appear after the first valid telemetry
                        message reaches the backend.
                      </p>
                    </div>
                  )}
                  <div className="detail-bottom">
                    <section className="panel signal-panel">
                      <div className="panel-heading">
                        <h3>Signal path</h3>
                        <span className="muted">Architecture</span>
                      </div>
                      <div className="signal-path">
                        <div>
                          <Cpu />
                          <strong>Machine</strong>
                          <span>Modbus RTU</span>
                        </div>
                        <ChevronRight className="path-arrow" />
                        <div>
                          <Wifi />
                          <strong>ESP32</strong>
                          <span>Wi-Fi / MQTT</span>
                        </div>
                        <ChevronRight className="path-arrow" />
                        <div>
                          <Database />
                          <strong>Backend</strong>
                          <span>Latest state</span>
                        </div>
                      </div>
                      <p>
                        This diagram describes the connection flow. It does not
                        independently verify each link.
                      </p>
                    </section>
                    <section className="panel contact-panel">
                      <div className="panel-heading">
                        <h3>Data context</h3>
                        <Clock3 size={17} />
                      </div>
                      <dl>
                        <div>
                          <dt>Backend last contact</dt>
                          <dd>{relativeTime(selected.lastSeenAt, now)}</dd>
                        </div>
                        <div>
                          <dt>Configured interval</dt>
                          <dd>
                            {config.catalog
                              ? `${config.catalog.samplingIntervalMs} ms`
                              : "Unavailable"}
                          </dd>
                        </div>
                        <div>
                          <dt>Measurement history</dt>
                          <dd>Not available yet</dd>
                        </div>
                      </dl>
                      <p>
                        Last contact includes status messages. Individual
                        measurement timestamps are not available.
                      </p>
                    </section>
                  </div>
                </section>
              )}
            </>
          )}

          {page === "registers" && (
            <>
              <section className="panel catalog-panel">
                <div className="panel-heading">
                  <div>
                    <h2>Machine configuration</h2>
                    <p className="muted">
                      Read-only configuration from the backend catalog.
                    </p>
                  </div>
                  <button
                    className="button"
                    disabled={!config.catalog}
                    onClick={() =>
                      config.catalog && exportCatalog(config.catalog)
                    }
                  >
                    <ArrowDownToLine size={16} />
                    Export JSON
                  </button>
                </div>
                <div className="catalog-selector">
                  <label htmlFor="catalog-device">Machine</label>
                  <select
                    id="catalog-device"
                    value={selected?.deviceId || ""}
                    onChange={(e) => setSelectedId(e.target.value)}
                    disabled={!feed.machines.length}
                  >
                    {!feed.machines.length && (
                      <option value="">No machines available</option>
                    )}
                    {feed.machines.map((m) => (
                      <option key={m.deviceId} value={m.deviceId}>
                        {m.name} · {m.deviceId}
                      </option>
                    ))}
                  </select>
                  <button
                    className="button"
                    disabled={!selected || config.loading}
                    onClick={config.refresh}
                  >
                    <RefreshCw size={16} />
                    Reload map
                  </button>
                </div>
                {config.catalog && (
                  <dl className="config-facts">
                    <div>
                      <dt>Protocol</dt>
                      <dd>{config.catalog.protocol.replaceAll("_", " ")}</dd>
                    </div>
                    <div>
                      <dt>Serial</dt>
                      <dd>
                        {config.catalog.baudRate} / {config.catalog.parity} /{" "}
                        {config.catalog.stopBits} stop
                      </dd>
                    </div>
                    <div>
                      <dt>Slave ID</dt>
                      <dd>{config.catalog.slaveId}</dd>
                    </div>
                    <div>
                      <dt>Sampling</dt>
                      <dd>{config.catalog.samplingIntervalMs} ms</dd>
                    </div>
                  </dl>
                )}
                {showCatalog()}
              </section>
              <div className="catalog-explainer">
                <section>
                  <h3>One conversion. At the gateway.</h3>
                  <p>
                    The ESP32 reads the raw register, decodes its data type and
                    applies the scale. The dashboard displays that reported
                    value without multiplying it again.
                  </p>
                  <div className="conversion">
                    <code>1200</code>
                    <span>× 0.1</span>
                    <ArrowRight size={18} />
                    <strong>120 °C</strong>
                    <span className="muted">Example</span>
                  </div>
                </section>
                <section>
                  <h3>Configuration changes</h3>
                  <p>
                    This screen inspects the catalog. Editing, publishing to
                    ESP32 and verifying its acknowledgement require a backend
                    API that is not available yet.
                  </p>
                  <p className="muted">
                    The catalog is not proof of the configuration currently
                    running on the device.
                  </p>
                </section>
              </div>
              {config.catalog?.registerMap.some(
                (r) => r.alarm_high !== undefined,
              ) ? (
                <section className="panel">
                  <div className="panel-heading">
                    <h2>Configured alarm thresholds</h2>
                    <span className="muted">Catalog values</span>
                  </div>
                  <div className="threshold-list">
                    {config.catalog.registerMap
                      .filter((r) => r.alarm_high !== undefined)
                      .map((r) => (
                        <div key={r.key}>
                          <strong>{metricName(r.key)}</strong>
                          <span>
                            High: {r.alarm_high} {r.unit}
                          </span>
                          <span>
                            Critical: {r.alarm_critical ?? "Not configured"}{" "}
                            {r.alarm_critical != null ? r.unit : ""}
                          </span>
                        </div>
                      ))}
                  </div>
                  <p className="table-note">
                    These are configuration values, not active alarm events.
                  </p>
                </section>
              ) : (
                <Notice>
                  Alarm thresholds are not included in this catalog response. No
                  thresholds or active alarms are inferred by this interface.
                </Notice>
              )}
            </>
          )}

          {page === "connection" && (
            <div className="connection-layout">
              <section className="panel connection-form">
                <div className="panel-heading">
                  <h2>Backend address</h2>
                  <Server size={20} />
                </div>
                <form onSubmit={saveConnection} noValidate>
                  <label htmlFor="backend-address">HTTP API URL</label>
                  <p id="address-help">
                    Use the address of the laptop running the HTTP backend on
                    the same network.
                  </p>
                  <input
                    id="backend-address"
                    type="url"
                    value={draft}
                    onChange={(e) => {
                      setDraft(e.target.value);
                      setSaved("");
                      setAddressError("");
                    }}
                    placeholder="http://192.168.1.20:3000"
                    autoComplete="off"
                    spellCheck={false}
                    aria-invalid={!!addressError}
                    aria-describedby={`address-help${addressError ? " address-error" : ""}`}
                  />
                  {addressError && (
                    <p id="address-error" className="field-error" role="alert">
                      {addressError}
                    </p>
                  )}
                  <p className="form-tip">
                    Use port 3000 for HTTP, not the MQTT broker port 1883. On
                    another computer, localhost points to that computer.
                  </p>
                  <button className="button primary" type="submit">
                    Save & connect
                    <ArrowRight size={16} />
                  </button>
                  {saved && (
                    <p className="saved-message" role="status">
                      <Check size={16} />
                      {saved}
                    </p>
                  )}
                </form>
                <div className="connection-status">
                  <strong>Current source</strong>
                  <code>
                    {mode === "sample"
                      ? "Sample workspace (no API requests)"
                      : base}
                  </code>
                  <span>
                    {mode === "sample"
                      ? "Return to Live API to test the backend."
                      : isConnected
                        ? "The machines endpoint returned a valid response."
                        : "No current, successful response from the machines endpoint."}
                  </span>
                </div>
              </section>
              <section className="connection-guide">
                <h2>Ready for a live demo</h2>
                <ol>
                  <li>
                    <strong>Start the backend</strong>
                    <p>
                      Run both its MQTT consumer and HTTP server. Keep the
                      database and broker available.
                    </p>
                  </li>
                  <li>
                    <strong>Join the same network</strong>
                    <p>
                      Connect the ESP32 and both laptops to the same 2.4 GHz
                      hotspot or a reachable local network.
                    </p>
                  </li>
                  <li>
                    <strong>Check the device catalog</strong>
                    <p>
                      The catalog device ID must match the ESP32. Then update a
                      register in OpenModSim and watch the reading here.
                    </p>
                  </li>
                </ol>
                <div className="guide-note">
                  <Cable size={20} />
                  <p>
                    For a phone hotspot, the backend IP may change after
                    reconnecting. Update it here; no frontend rebuild is needed.
                  </p>
                </div>
              </section>
              <section className="panel integration-panel">
                <div className="panel-heading">
                  <h2>Available in this version</h2>
                  <span className="muted">Backend integration</span>
                </div>
                <div className="capability">
                  <Check size={17} />
                  <span>Machine list and latest readings</span>
                  <code>GET /machines</code>
                </div>
                <div className="capability">
                  <Check size={17} />
                  <span>Device register map</span>
                  <code>GET /catalog</code>
                </div>
                <div className="capability pending">
                  <Clock3 size={17} />
                  <span>
                    Alarm history, charts and configuration publishing
                  </span>
                  <span>Awaiting backend APIs</span>
                </div>
              </section>
            </div>
          )}
          <footer className="page-footer">
            <span>
              Legacy-link <span className="separator">/</span> Making legacy
              data visible
            </span>
            <span>
              <span className="status-dot" />
              {mode === "sample"
                ? "Illustrative sample data"
                : "Read-only HTTP connection"}
            </span>
          </footer>
        </main>
      </div>
    </div>
  );
}

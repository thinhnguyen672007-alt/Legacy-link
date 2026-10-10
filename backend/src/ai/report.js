// Model supplies interpretation only. Facts, priority and chart data come from backend tools.
export const analysisSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    summary: { type: "string", maxLength: 1500 },
    findings: {
      type: "array",
      maxItems: 8,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          title: { type: "string", maxLength: 160 },
          explanation: { type: "string", maxLength: 1000 },
          evidenceIds: {
            type: "array",
            minItems: 1,
            maxItems: 8,
            items: { type: "string" },
          },
          nextCheck: { type: "string", maxLength: 500 },
        },
        required: ["title", "explanation", "evidenceIds", "nextCheck"],
      },
    },
    followUp: { type: "string", maxLength: 500 },
    view: { type: "string", enum: ["brief", "workspace"] },
  },
  required: ["summary", "findings", "followUp", "view"],
};
const text = (value, max) =>
  typeof value === "string" &&
  value.length <= max &&
  !/\b(?:AIza|AQ\.)[\w.-]{20,}\b/.test(value);
export function validateAnalysis(value, evidenceIds) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).some(
      (k) => !Object.hasOwn(analysisSchema.properties, k),
    ) ||
    !text(value.summary, 1500) ||
    !value.summary.trim() ||
    !text(value.followUp, 500) ||
    !["brief", "workspace"].includes(value.view) ||
    !Array.isArray(value.findings) ||
    value.findings.length > 8
  )
    throw new Error("Invalid analysis schema");
  for (const finding of value.findings) {
    if (
      !finding ||
      Object.keys(finding).some(
        (k) =>
          !["title", "explanation", "evidenceIds", "nextCheck"].includes(k),
      ) ||
      !text(finding.title, 160) ||
      !text(finding.explanation, 1000) ||
      !text(finding.nextCheck, 500) ||
      !Array.isArray(finding.evidenceIds) ||
      !finding.evidenceIds.length ||
      finding.evidenceIds.length > 8 ||
      finding.evidenceIds.some((id) => !evidenceIds.includes(id))
    )
      throw new Error("Unsupported analysis evidence");
  }
  return value;
}
const finiteOrNull = (v) => v === null || Number.isFinite(v);
const dateOrNull = (v) =>
  v === null || (typeof v === "string" && Number.isFinite(Date.parse(v)));
const list = (v, max, check) =>
  Array.isArray(v) && v.length <= max && v.every(check);
const optional = (v, check) => v === undefined || check(v);
export function validateResult(result, name) {
  const invalid = () => {
    throw new Error("Invalid backend tool result");
  };
  if (
    !result ||
    result.tool !== name ||
    result.source !== "database" ||
    !dateOrNull(result.queriedAt) ||
    result.queriedAt === null
  )
    invalid();
  for (const key of ["partial", "truncated"])
    if (!optional(result[key], (v) => typeof v === "boolean")) invalid();
  if (
    !optional(
      result.counts,
      (counts) =>
        counts &&
        [
          "inspected",
          "gatewayOnline",
          "offline",
          "stale",
          "overheat",
          "underheat",
          "normal",
          "unknown",
        ].every(
          (k) =>
            Number.isInteger(counts[k]) &&
            counts[k] >= 0 &&
            counts[k] <= counts.inspected,
        ) &&
        counts.inspected <= 100,
    )
  )
    invalid();
  if (
    !optional(result.devices, (devices) =>
      list(
        devices,
        100,
        (d) =>
          d &&
          text(d.deviceId, 31) &&
          /^[A-Za-z0-9_-]+$/.test(d.deviceId) &&
          text(d.name, 256) &&
          typeof d.gatewayOnline === "boolean" &&
          typeof d.dataFresh === "boolean" &&
          optional(d.failureConfirmed, (v) => v === false) &&
          optional(d.provenance, (v) =>
            ["simulation", "unverified"].includes(v),
          ) &&
          optional(d.priority, (v) => ["high", "medium", "low"].includes(v)) &&
          ["reasons", "nextChecks"].every((k) =>
            optional(d[k], (v) => list(v, 64, (item) => text(item, 1000))),
          ) &&
          optional(d.metrics, (v) =>
            list(
              v,
              16,
              (m) =>
                m &&
                text(m.key, 19) &&
                finiteOrNull(m.value) &&
                text(m.unit, 64) &&
                dateOrNull(m.measuredAt) &&
                [true, false, null].includes(m.readSuccess),
            ),
          ) &&
          list(
            d.temperatures,
            16,
            (t) =>
              t &&
              text(t.metricKey, 19) &&
              text(t.unit, 64) &&
              [
                "normal",
                "overheat",
                "underheat",
                "offline",
                "stale",
                "unknown",
              ].includes(t.status) &&
              ["value", "low", "high"].every((k) => finiteOrNull(t[k])) &&
              optional(t.critical, finiteOrNull) &&
              dateOrNull(t.measuredAt) &&
              (t.reason === null || text(t.reason, 1000)),
          ),
      ),
    )
  )
    invalid();
  if (
    !optional(result.alerts, (v) =>
      list(
        v,
        50,
        (a) =>
          a &&
          text(a.id, 64) &&
          text(a.deviceId, 31) &&
          Number.isFinite(a.timestamp) &&
          text(a.code, 64) &&
          ["low", "medium", "high", "critical"].includes(a.severity) &&
          finiteOrNull(a.value),
      ),
    )
  )
    invalid();
  if (
    !optional(result.errors, (v) =>
      list(v, 6, (e) => e && text(e.deviceId, 31) && text(e.message, 1000)),
    )
  )
    invalid();
  if (
    !optional(result.series, (v) =>
      list(
        v,
        96,
        (s) =>
          s &&
          text(s.metricKey, 19) &&
          text(s.unit, 64) &&
          optional(s.unitVerified, (v) => v === false) &&
          ["min", "max", "change"].every((k) => finiteOrNull(s[k])) &&
          list(
            s.points,
            2000,
            (p) =>
              p && Number.isFinite(p.timestamp) && Number.isFinite(p.value),
          ) &&
          optional(s.sampledCount, (v) => v === s.points.length),
      ),
    )
  )
    invalid();
  if ((result.series ?? []).reduce((sum, s) => sum + s.points.length, 0) > 6000)
    invalid();
  return result;
}
export function compactEvidence(result) {
  // Full points stay in the dashboard; the model gets statistics and a bounded sample.
  return {
    ...result,
    devices: result.devices?.slice(0, 30),
    modelDevicesLimited: (result.devices?.length ?? 0) > 30,
    series: result.series?.map((s) => ({
      ...s,
      points: s.points.filter(
        (_, i) => i % Math.max(1, Math.ceil(s.points.length / 40)) === 0,
      ),
      modelPointsSampled: s.points.length > 40,
    })),
  };
}

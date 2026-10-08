import { describe, expect, it } from "vitest";
import {
  machineState,
  modiconReference,
  normalizeBaseUrl,
  parseCatalog,
  parseMachines,
  relativeTime,
} from "../src/model";
import { sampleCatalog, sampleMachines } from "../src/samples";
const now = Date.parse("2026-10-08T08:00:00Z");
describe("backend contract", () => {
  it("preserves negative, zero and arbitrary named measurements without scaling again", () => {
    const data = sampleMachines(now);
    data[0].metrics = { temperature: -18, torque: 0, pressure: 1.23 };
    expect(parseMachines(data)[0].metrics).toEqual(data[0].metrics);
  });
  it("accepts nullable metrics and last contact", () => {
    expect(parseMachines(sampleMachines(now))[2].metrics).toBeNull();
  });
  it.each([
    { temperature: "25" },
    { temperature: NaN },
    [1, 2],
    { temperature: null },
  ])("rejects malformed metrics %j", (metrics) => {
    const data = sampleMachines(now);
    expect(() => parseMachines([{ ...data[0], metrics }])).toThrow();
  });
  it("rejects invalid top-level responses, duplicate IDs and string booleans", () => {
    expect(() => parseMachines({ data: [] })).toThrow();
    const m = sampleMachines(now)[0];
    expect(() => parseMachines([m, m])).toThrow();
    expect(() => parseMachines([{ ...m, online: "false" }])).toThrow();
  });
  it("accepts PostgreSQL decimal strings and optional alarm fields", () => {
    const c = sampleCatalog("x");
    const actual = parseCatalog(
      {
        ...c,
        registerMap: [{ ...c.registerMap[0], scale: "0.1", alarm_high: "90" }],
      },
      "x",
    );
    expect(actual.registerMap[0].scale).toBe(0.1);
    expect(actual.registerMap[0].alarm_high).toBe(90);
  });
  it("rejects mismatched catalog identity and malformed raw address", () => {
    const c = sampleCatalog("x");
    expect(() => parseCatalog(c, "y")).toThrow();
    expect(() =>
      parseCatalog(
        { ...c, registerMap: [{ ...c.registerMap[0], address: -1 }] },
        "x",
      ),
    ).toThrow();
  });
  it("derives Modicon references without modifying the raw address", () => {
    const reg = { ...sampleCatalog("x").registerMap[0], address: 49 };
    expect(modiconReference(reg)).toBe(40050);
    expect(reg.address).toBe(49);
    expect(modiconReference({ ...reg, functionCode: 4 })).toBe(30050);
  });
});
describe("honest states", () => {
  it("distinguishes online, offline, quiet and unprovisioned observations", () => {
    const [online, offline, waiting] = sampleMachines(now);
    expect(machineState(online, now)).toBe("online");
    expect(machineState(offline, now)).toBe("offline");
    expect(machineState(waiting, now)).toBe("waiting");
    expect(machineState(online, now + 16000)).toBe("quiet");
    expect(machineState({ ...online, metrics: {} }, now)).toBe("waiting");
  });
  it("does not claim future timestamps are freshly received", () => {
    expect(machineState(sampleMachines(now + 10000)[0], now)).toBe("clock");
    expect(relativeTime(new Date(now + 10000).toISOString(), now)).toBe(
      "In the future",
    );
  });
});
describe("address configuration", () => {
  it("normalizes a LAN backend and optional path prefix", () => {
    expect(normalizeBaseUrl(" http://192.168.1.20:3000/ ")).toBe(
      "http://192.168.1.20:3000",
    );
    expect(normalizeBaseUrl("https://example.com/api/")).toBe(
      "https://example.com/api",
    );
  });
  it.each([
    "javascript:alert(1)",
    "mqtt://localhost",
    "http://a:b@localhost",
    "http://localhost/?token=x",
    "localhost:3000",
  ])("rejects unsafe or incorrect URL %s", (url) => {
    expect(() => normalizeBaseUrl(url)).toThrow();
  });
});

it("preserves additional catalog fields during validation and export", () => {
  const base = sampleCatalog("x");
  const parsed = parseCatalog(
    {
      ...base,
      configVersion: 3,
      registerMap: [
        {
          ...base.registerMap[0],
          alarm_high: 90,
          alarm_code: "OVERHEAT",
          alarm_hysteresis: 3,
          alarm_severity: "high",
          wordOrder: "LOW_FIRST",
        },
      ],
    },
    "x",
  );
  expect(JSON.parse(JSON.stringify(parsed))).toMatchObject({
    configVersion: 3,
    registerMap: [
      { alarm_hysteresis: 3, alarm_severity: "high", wordOrder: "LOW_FIRST" },
    ],
  });
});

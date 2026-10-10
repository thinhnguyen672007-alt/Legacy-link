// Kiểm tra đọc API thật; không in token, không gửi lệnh phần cứng.
import { execFileSync } from "node:child_process";
import { z } from "zod";
import {
  machineSchema,
  gatewaySchema,
  profileSchema,
  configSchema,
  operationSchema,
  pageSchema,
  telemetrySchema,
  alarmSchema,
} from "../src/api/schema.ts";
const base = process.env.LEGACY_LINK_API_URL ?? "http://127.0.0.1:3000";
let token = process.env.LEGACY_LINK_READ_TOKEN;
if (process.argv[2] === "--container" && process.argv[3]) {
  const rows: string[] = JSON.parse(
    execFileSync(
      "docker",
      ["inspect", "--format", "{{json .Config.Env}}", process.argv[3]],
      { encoding: "utf8" },
    ),
  );
  token = rows
    .find((s) => s.startsWith("API_READ_TOKEN="))
    ?.slice("API_READ_TOKEN=".length);
}
if (!token)
  throw new Error(
    "Cần LEGACY_LINK_READ_TOKEN hoặc --container <tên API local>.",
  );
async function read<T>(path: string, schema: z.ZodType<T>) {
  const response = await fetch(base + path, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok)
    throw new Error(`${path.split("?")[0]}: HTTP ${response.status}`);
  const result = schema.safeParse(await response.json());
  if (!result.success)
    throw new Error(
      `${path.split("?")[0]}: schema mismatch ${result.error.issues.map((i) => i.path.join(".")).join(",")}`,
    );
  console.log(`PASS ${path.split("?")[0]}`);
  return result.data;
}
const machines = await read("/machines", z.array(machineSchema));
await read("/gateways", z.array(gatewaySchema));
await read("/profiles", z.array(profileSchema));
await read("/operations", z.array(operationSchema));
await read("/alarms", pageSchema(alarmSchema));
if (machines[0]) {
  const id = encodeURIComponent(machines[0].deviceId);
  await read(`/machines/${id}`, machineSchema);
  await read(`/catalog?deviceId=${id}`, configSchema);
  await read(`/machines/${id}/telemetry`, pageSchema(telemetrySchema));
}
const cors = await fetch(base + "/machines", {
  headers: {
    Authorization: `Bearer ${token}`,
    Origin: "http://127.0.0.1:5173",
  },
});
console.log(
  "CORS cho http://127.0.0.1:5173:",
  cors.status,
  cors.headers.get("access-control-allow-origin") ?? "không có header",
);

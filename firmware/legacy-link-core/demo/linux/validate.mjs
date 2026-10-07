// Server-side validation uses the repository's actual backend validators.
import readline from 'node:readline';
import { validateTelemetry } from '../../../../backend/src/validation/telemetry.js';
import { validateStatus } from '../../../../backend/src/validation/status.js';
import { validateAlarm } from '../../../../backend/src/validation/alarm.js';
const validators = { telemetry: validateTelemetry, status: validateStatus, alarm: validateAlarm };
for await (const line of readline.createInterface({ input: process.stdin })) {
  try {
    const message = JSON.parse(line);
    const match = /^legacy-link\/devices\/([^/]+)\/(telemetry|status|alarm)$/.exec(message.topic);
    const result = match ? validators[match[2]](match[1], message.payload) : { ok: false, errors: ['Unsupported topic'] };
    console.log(JSON.stringify(result));
  } catch {
    console.log(JSON.stringify({ ok: false, errors: ['Invalid JSON'] }));
  }
}

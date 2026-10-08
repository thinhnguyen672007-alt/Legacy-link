import mqtt from 'mqtt';
import { config } from '../config.js';
import { saveAppliedConfig } from '../db/provisioning.js';
import { ControlService } from './service.js';

export function startControlService() {
  const client = mqtt.connect(config.mqtt.url, {
    username: config.mqtt.username, password: config.mqtt.password,
    clientId: `${config.mqtt.clientId}-control-${process.pid}`, reconnectPeriod: 3000,
    connectTimeout: 5000, queueQoSZero: false,
  });
  client.on('error', err => console.error('[CONTROL] MQTT:', err.message));
  return new ControlService(client, { saveConfig: saveAppliedConfig });
}

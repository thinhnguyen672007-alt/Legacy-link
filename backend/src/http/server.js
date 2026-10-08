import http from 'node:http';
import { config } from '../config.js';
import { startControlService } from '../control/client.js';
import { createHttpHandler } from './handler.js';
import { httpSettings } from './settings.js';
import { closePool } from '../db/pool.js';
import { getCatalog } from '../db/catalog.js';
import { listMachines, getMachine } from '../db/machines.js';
import { telemetryHistory, listAlarms, acknowledgeAlarm } from '../db/dashboard.js';
import { databaseReadiness } from '../db/health.js';
import { getConfigRequest } from '../db/config-request.js';
import { listServiceRuns } from '../db/service-run.js';
import { applyConfig } from '../service/apply-config.js';
import { startPublisher } from '../mqtt/publisher.js';

const settings=httpSettings();
const controls=startControlService();
const publisher=startPublisher();
async function readiness() {
  let timer;
  let database={database:false,consumer:false,consumerHeartbeatAt:null};
  try {
    database=await Promise.race([databaseReadiness(config.mqtt.clientId),new Promise((_,reject)=>{
      timer=setTimeout(()=>reject(new Error('Readiness deadline')),2000);
    })]);
  } catch { /* Readiness is false while DB or required schema is unavailable. */ }
  finally { clearTimeout(timer); }
  const checks={...database,mqttPublisher:publisher.connected,mqttControl:controls.client.connected && controls.subscribed};
  return {ready:checks.database&&checks.consumer&&checks.mqttPublisher&&checks.mqttControl,checks};
}
const server=http.createServer(createHttpHandler({controls,listMachines,getMachine,getCatalog,
  telemetryHistory,listAlarms,acknowledgeAlarm,getConfigRequest,listServiceRuns,readiness,
  applyConfig:deviceId=>applyConfig({deviceId,publishClient:publisher})}));
server.requestTimeout=15000;
server.headersTimeout=10000;
server.on('clientError',(_,socket)=>socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\nContent-Length: 0\r\n\r\n'));
let stopping=false;
async function shutdown(code=0) {
  if(stopping) return;
  stopping=true;
  const force=setTimeout(()=>process.exit(code),5000); force.unref();
  controls.close(); publisher.end(true);
  server.close(async()=>{ await closePool(); clearTimeout(force); process.exit(code); });
  server.closeIdleConnections();
}
server.on('error',error=>{console.error('[HTTP] Listen failed:',error.code??error.message);void shutdown(1);});
server.listen(settings.port,settings.host,()=>console.log(`[HTTP] Listening port=${server.address().port}`));
for(const signal of ['SIGINT','SIGTERM']) process.on(signal,()=>void shutdown());

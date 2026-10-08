import { ControlError } from '../control/validation.js';
import { integer, deviceId, rowId, pageParams } from './params.js';

function send(res,status,body) {
  res.statusCode=status;
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('Cache-Control','no-store');
  res.end(JSON.stringify(body));
}
async function readBody(req) {
  if (req.headers['content-type']?.split(';')[0].trim().toLowerCase() !== 'application/json')
    throw new ControlError('Content-Type must be application/json',415);
  if (Number(req.headers['content-length'])>12288) throw new ControlError('Request body too large',413);
  let bytes=0; const chunks=[];
  for await (const chunk of req) {
    bytes+=chunk.length;
    if(bytes>12288) throw new ControlError('Request body too large',413);
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString()); }
  catch { throw new ControlError('Malformed JSON'); }
}
function notFound(result) {
  if(result==null) throw new ControlError('Resource not found',404);
  return result;
}
export function createHttpHandler(deps) {
  const {controls,listMachines,getMachine,getCatalog,applyConfig,getConfigRequest,
    telemetryHistory,listAlarms,acknowledgeAlarm,listServiceRuns,readiness}=deps;
  return async(req,res)=>{
    res.setHeader('Access-Control-Allow-Origin','*');
    res.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers','Content-Type');
    try {
      // Parse against a fixed base; never build an origin from untrusted Host.
      let url, path;
      try {
        if(typeof req.url!=='string' || !req.url.startsWith('/') || req.url.startsWith('//')) throw new Error();
        url=new URL(req.url,'http://localhost');
        path=decodeURIComponent(url.pathname);
      } catch { throw new ControlError('Malformed request URL'); }
      const params=url.searchParams;
      const route=(method,run)=>({method,run});
      let selected;
      if(path==='/health' || path==='/health/live') selected=route('GET',()=>({status:'alive'}));
      else if(path==='/health/ready') selected=route('GET',async()=>{
        const result=await readiness();
        send(res,result.ready?200:503,result);
      });
      else if(path==='/machines') selected=route('GET',listMachines);
      else if(path==='/gateways') selected=route('GET',()=>controls.listGateways());
      else if(path==='/catalog') selected=route('GET',async()=>notFound(await getCatalog(deviceId(params.get('deviceId')))));
      else if(path==='/uptime') selected=route('GET',()=>listServiceRuns(integer(params.get('limit'),'limit',20,1,100)));
      else if(path==='/alarms') selected=route('GET',()=>readAlarms());
      else if(path==='/hello') selected=route('GET',()=>({message:`Hello ${params.get('name')??'guy'}`}));
      else {
        let match;
        if((match=/^\/machines\/([^/]+)(?:\/(telemetry|alarms))?$/.exec(path))) {
          selected=route('GET',async()=>{
            const id=deviceId(match[1]);
            const machine=notFound(await getMachine(id));
            if(match[2]==='telemetry') return telemetryHistory(id,pageParams(params));
            if(match[2]==='alarms') return readAlarms(id);
            return machine;
          });
        } else if((match=/^\/alarms\/([^/]+)\/ack$/.exec(path))) {
          selected=route('POST',async()=>notFound(await acknowledgeAlarm(rowId(match[1]))));
        } else if((match=/^\/operations\/([A-Za-z0-9-]+)$/.exec(path))) {
          selected=route('GET',()=>controls.getOperation(match[1]));
        } else if((match=/^\/gateways\/([A-F0-9]{12})\/(probe|apply)$/.exec(path))) {
          selected=route('POST',async()=>{
            send(res,202,controls.start(match[1],match[2],await readBody(req)));
          });
        } else if((match=/^\/devices\/([^/]+)\/config$/.exec(path))) {
          selected=route('POST',async()=>{
            const id=deviceId(match[1]);
            const result=await applyConfig(id);
            if(result.ok) send(res,202,{requestId:result.requestId,deviceId:result.deviceId,gatewayId:result.gatewayId,status:'pending'});
            else if(result.code==='unknown_device') throw new ControlError('Unknown device',404);
            else if(result.code==='already_pending') send(res,409,{error:'A configuration request is already pending',code:result.code,pendingRequestId:result.pending.request_id,sentAt:result.pending.sent_at});
            else send(res,503,{error:'MQTT publication unavailable; check request outcome',code:result.code,requestId:result.requestId});
          });
        } else if((match=/^\/config-requests\/([^/]+)$/.exec(path))) {
          selected=route('GET',async()=>notFound(await getConfigRequest(match[1])));
        }
      }
      if(!selected) throw new ControlError('Endpoint not found',404);
      res.setHeader('Allow',`${selected.method}, OPTIONS`);
      if(req.method==='OPTIONS') { res.statusCode=204; res.end(); return; }
      if(req.method!==selected.method) throw new ControlError('Method not allowed',405);
      const result=await selected.run();
      if(!res.headersSent) send(res,200,result);

      async function readAlarms(id) {
        const severity=params.get('severity');
        if(severity!==null && !['low','medium','high','critical'].includes(severity)) throw new ControlError('Invalid severity');
        const acknowledged=params.get('acknowledged');
        if(acknowledged!==null && !['true','false'].includes(acknowledged)) throw new ControlError('acknowledged must be true or false');
        const filter=id??(params.has('deviceId')?deviceId(params.get('deviceId')):null);
        if(filter && !id) notFound(await getMachine(filter));
        return listAlarms({...pageParams(params),deviceId:filter,severity,acknowledged:acknowledged===null?null:acknowledged==='true'});
      }
    } catch(error) {
      if(res.headersSent) { res.end(); return; }
      if(error instanceof ControlError) { send(res,error.status,{error:error.message,code:`http_${error.status}`}); return; }
      console.error('[HTTP]',error.message);
      const unavailable=error.code?.startsWith?.('08') || ['ECONNREFUSED','ECONNRESET','57P01','57P02','57P03'].includes(error.code);
      send(res,unavailable?503:500,{error:unavailable?'Database unavailable':'Internal server error',code:unavailable?'unavailable':'internal_error'});
    }
  };
}

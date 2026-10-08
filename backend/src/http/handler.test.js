import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { createHttpHandler } from './handler.js';
import { ControlError } from '../control/validation.js';
// Exercise the actual HTTP handler with request streams, without a TCP listener.
async function request(method, path, body, headers = {}) {
  const calls = [];
  const handler = createHttpHandler({
    controls: {
      listGateways: () => [{gatewayId:'643C60A7DBCC',online:true}],
      getOperation: id => { if(id==='missing') throw new ControlError('missing',404); return {id,phase:'received'}; },
      start: (gateway, kind, data) => { calls.push({gateway,kind,data}); return {id:'test-id',phase:'sent'}; },
    }, listMachines: async () => [], getCatalog: async id => id === 'known' ? {deviceId:id} : null,
    applyConfig: async deviceId => {
      calls.push({deviceId});
      if (deviceId === 'missing') return {ok:false,code:'unknown_device'};
      if (deviceId === 'busy') return {ok:false,code:'already_pending',pending:{request_id:'pending-id',sent_at:'now'}};
      if (deviceId === 'offline') return {ok:false,code:'publish_failed',requestId:'failed-id'};
      return {ok:true,deviceId,gatewayId:'643C60A7DBCC',requestId:'db-request'};
    },
    getConfigRequest: async id => id === 'missing' ? null : {request_id:id,status:'applied'},
  });
  const req = Readable.from(body === undefined ? [] : [Buffer.from(body)]);
  req.method=method; req.url=path; req.headers={host:'localhost:3000','content-type':'application/json',...headers};
  const res={ statusCode:200, headers:{}, body:'', setHeader(k,v){this.headers[k]=v;},end(value){this.body=value ?? '';this.headersSent=true;} };
  await handler(req,res);
  return {...res, data: res.body ? JSON.parse(res.body) : null, calls};
}
test('HTTP gateway discovery, commands and operation correlation', async () => {
  assert.equal((await request('GET','/gateways')).data[0].online,true);
  const response = await request('POST','/gateways/643C60A7DBCC/probe',JSON.stringify({config:{deviceId:'A'}}));
  assert.equal(response.statusCode,202); assert.equal(response.calls[0].kind,'probe');
  assert.equal((await request('GET','/operations/test-id')).data.phase,'received');
  assert.equal((await request('GET','/operations/missing')).statusCode,404);
});
test('HTTP rejects malformed JSON, unsafe content types, oversized bodies and unsupported methods', async () => {
  const route='/gateways/643C60A7DBCC/apply';
  assert.equal((await request('POST',route,'{')).statusCode,400);
  assert.equal((await request('POST',route,'{}',{'content-type':'text/plain'})).statusCode,415);
  assert.equal((await request('POST',route,'{}',{'content-length':'99999'})).statusCode,413);
  assert.equal((await request('DELETE','/machines')).statusCode,405);
  assert.equal((await request('OPTIONS',route)).statusCode,204);
});
test('merged catalog apply and database request routes remain available alongside probe routes', async () => {
  const response = await request('POST','/devices/known/config');
  assert.equal(response.statusCode,202);
  assert.equal(response.data.requestId,'db-request');
  assert.equal(response.calls[0].deviceId,'known');
  assert.equal((await request('POST','/devices/missing/config')).statusCode,404);
  assert.equal((await request('POST','/devices/busy/config')).statusCode,409);
  assert.equal((await request('POST','/devices/offline/config')).statusCode,503);
  const readOnly = await request('GET','/devices/known/config');
  assert.equal(readOnly.statusCode,405); assert.equal(readOnly.calls.length,0);
  assert.equal((await request('GET','/config-requests/db-request')).data.status,'applied');
  assert.equal((await request('GET','/config-requests/missing')).statusCode,404);
  assert.equal((await request('POST','/config-requests/db-request')).statusCode,405);
});

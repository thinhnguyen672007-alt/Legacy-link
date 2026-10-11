const {test} = require('node:test');
const assert = require('node:assert/strict');
const {AlarmPoller, normalizeServer, validatePage} = require('../alarms.cjs');
const a = (id, timestamp = 100000000) => ({id, timestamp, deviceId:'BENCH-01', severity:'high', code:'OVERHEAT', value:95});
const page = (items, nextCursor = null) => ({items, nextCursor});
const flush = () => new Promise(r => setImmediate(r));
function create(fetchPage) {
 const events=[], states=[];
 const p = new AlarmPoller({fetchPage, notify: rows => events.push(rows), status:(...s)=>states.push(s), now:()=>100000000, interval:1000000});
 return {p,events,states};
}
async function tick(p) {clearTimeout(p.timer);await p.tick(p.generation);clearTimeout(p.timer);}
test('only server origins accepted',()=>{
 assert.equal(normalizeServer(' http://192.168.1.13:8080/ '),'http://192.168.1.13:8080');
 for (const url of ['file:///etc/passwd','http://user:pass@host','http://host/api','http://host/?token=x','http://host/#x']) assert.throws(()=>normalizeServer(url));
});
test('baseline silent, repeated IDs silent, late and large IDs notify',async()=>{
 let rows=[a('1')];const {p,events}=create(async()=>page(rows));p.start('token');await flush();
 assert.equal(events.length,0);rows=[a('9007199254740993',99999999),a('1')];await tick(p);
 assert.equal(events[0][0].id,'9007199254740993');await tick(p);assert.equal(events.length,1);p.stop();
});
test('all pages read with same window',async()=>{
 let round=0;const calls=[];const {p,events}=create(async q=>{calls.push(q);return q.cursor?page([a(round?'3':'2')]):page([a('1')],'next');});
 p.start('token');await flush();round=1;await tick(p);assert.equal(events[0][0].id,'3');assert.equal(calls[0].to,calls[1].to);p.stop();
});
test('partial failure does not commit IDs or reset baseline',async()=>{
 let mode=0;const {p,events}=create(async q=>{
 if(!mode)return page([a('1')]);if(q.cursor){if(mode===1)throw new Error('network');return page([a('3')]);}return page([a('2')],'next');
 });p.start('token');await flush();mode=1;await tick(p);assert.equal(events.length,0);mode=2;await tick(p);assert.equal(events[0].length,2);p.stop();
});
test('logout discards inflight response',async()=>{
 let resolve;const {p,events}=create(()=>new Promise(r=>{resolve=r;}));p.start('token');p.stop();resolve(page([a('1')]));await flush();assert.equal(events.length,0);assert.equal(p.baseline,false);
});
test('same session sync does not restart timer/baseline',async()=>{
 let calls=0;const {p}=create(async()=>{calls++;return page([a('1')]);});p.start('token');await flush();p.start('token');assert.equal(calls,1);assert.equal(p.baseline,true);p.stop();
});
test('401 stops with expired session identity; 403 stops without expiry',async()=>{
 for(const status of [401,403]){
 const {p,states}=create(async()=>{throw Object.assign(new Error('denied'),{status});});p.start('token');await flush();assert.equal(p.token,'');assert.equal(states.at(-1)[1],status===401?'token':undefined);p.stop();
 }
});
test('429 preserves baseline and Retry-After',async()=>{
 let bad=false;const {p}=create(async()=>{if(bad)throw Object.assign(new Error('rate'),{status:429,retryAfter:120000});return page([a('1')]);});p.start('token');await flush();bad=true;await tick(p);assert.equal(p.baseline,true);assert.equal(p.seen.size,1);p.stop();
});
test('invalid JSON schema and cursor loop do not commit baseline',async()=>{
 assert.throws(()=>validatePage(page([a('1',NaN)]),0,100));assert.throws(()=>validatePage(page([{...a('1'),id:123}]),0,100000000));
 const {p,states}=create(async()=>page([a('1')],'loop'));p.start('token');await flush();assert.equal(p.baseline,false);assert.match(states.at(-1)[0],/Mất kết nối/);p.stop();
});
test('new session cancels old response',async()=>{
 let resolve;const {p}=create(q=>q.token==='old'?new Promise(r=>{resolve=r;}):Promise.resolve(page([a('2')])));
 p.start('old');p.start('new');await flush();resolve(page([a('1')]));await flush();assert.deepEqual([...p.seen.keys()],['2']);p.stop();
});

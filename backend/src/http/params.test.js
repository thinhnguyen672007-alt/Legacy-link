// Kiểm tra giới hạn truy vấn để tránh số sai, khoảng thời gian quá lớn và con trỏ phân trang không hợp lệ.
import test from 'node:test';
import assert from 'node:assert/strict';
import { pageParams, rowId } from './params.js';
import { httpSettings } from './settings.js';
test('history rejects unsafe or unbounded query parameters',()=>{
  for(const query of ['limit=0','limit=501','limit=1x','from=100&to=90','from=0&to=9999999999','cursor=garbage','from=-1'])
    assert.throws(()=>pageParams(new URLSearchParams(query)));
  assert.throws(()=>rowId('9223372036854775808'));
  const params=pageParams(new URLSearchParams('from=1&to=100&limit=2'));
  assert.deepEqual(params,{from:1,to:100,limit:2,cursor:null});
});
test('pagination cursor is scoped to the requested time window',()=>{
  const cursor=Buffer.from(JSON.stringify({ts:50,id:'2'})).toString('base64url');
  assert.equal(pageParams(new URLSearchParams(`from=1&to=100&cursor=${cursor}`)).cursor.id,'2');
  assert.throws(()=>pageParams(new URLSearchParams(`from=51&to=100&cursor=${cursor}`)));
});
test('HTTP port is configurable and invalid settings fail explicitly',()=>{
  assert.deepEqual(httpSettings({}),{host:'0.0.0.0',port:3000});
  assert.equal(httpSettings({HTTP_PORT:'4010'}).port,4010);
  for(const port of ['abc','3000x','-1','65536','']) assert.throws(()=>httpSettings({HTTP_PORT:port}));
});

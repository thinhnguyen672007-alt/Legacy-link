import test from 'node:test';
import assert from 'node:assert/strict';
import {hashPassword,verifyPassword,tokenHash} from './accounts.js';
import {accountSecurity} from './security.js';
import {securitySettings} from '../http/security.js';
import {readFileSync} from 'node:fs';
test('deployment examples allow ngrok login and reject other origins',async()=>{
 const origin='https://vineyard-fifteen-elusive.ngrok-free.dev';
 for(const file of ['../../.env.example','../../../infrastructure/.env.example']){
  const config=readFileSync(new URL(file,import.meta.url),'utf8');
  const entries=config.split('\n').filter(line=>line.startsWith('CORS_ORIGINS='));
  assert.equal(entries.length,1,'each example must define CORS_ORIGINS once');
  const settings=securitySettings({API_READ_TOKEN:'r'.repeat(32),API_WRITE_TOKEN:'w'.repeat(32),CORS_ORIGINS:entries[0].slice('CORS_ORIGINS='.length)});
  const policy=accountSecurity(settings,{authenticate:async()=>null});
  const headers={};const res={setHeader(key,value){headers[key]=value;}};
  await policy({method:'POST',headers:{origin}},res,'/auth/login');
  assert.equal(headers['Access-Control-Allow-Origin'],origin);
  await assert.rejects(()=>policy({method:'POST',headers:{origin:'https://other.ngrok-free.dev'}},res,'/auth/login'),e=>e.status===403);
  await assert.rejects(()=>policy({method:'GET',headers:{origin}},res,'/auth/me'),e=>e.status===401);
 }
});
test('salted passwords verify without storing plaintext and malformed hashes fail closed',async()=>{
 const a=await hashPassword('a-good-password'),b=await hashPassword('a-good-password');
 assert.notEqual(a,b);assert.equal(await verifyPassword('a-good-password',a),true);
 assert.equal(await verifyPassword('wrong',a),false);assert.equal(await verifyPassword('anything','corrupt'),false);
 await assert.rejects(()=>hashPassword('short'));assert.equal(tokenHash('sample').length,64);
});
test('session roles and password change are checked before business actions',async()=>{
 let actor={id:'1',role:'viewer',mustChangePassword:false};
 const security=accountSecurity({origins:['http://localhost:5173'],readToken:'r'.repeat(32),writeToken:'w'.repeat(32)},{authenticate:async()=>actor});
 const res={setHeader(){}};
 const req=(method,origin)=>({method,headers:{authorization:'Bearer test',...(origin?{origin}:{})}});
 await security(req('GET'),res,'/machines');
 await security(req('POST'),res,'/ai/chat');
 await security(req('POST'),res,'/ai/query');
 await assert.rejects(()=>security(req('POST'),res,'/ai/execute'),e=>e.status===403);
 await assert.rejects(()=>security(req('POST'),res,'/config/preview'),e=>e.status===403);
 await assert.rejects(()=>security(req('GET'),res,'/admin/users'),e=>e.status===403);
 await assert.rejects(()=>security(req('POST','http://untrusted.invalid'),res,'/auth/login'),e=>e.status===403);
 actor={...actor,role:'admin',mustChangePassword:true};
 await assert.rejects(()=>security(req('GET'),res,'/admin/users'),e=>e.status===403);
 await security(req('POST'),res,'/auth/password');
 actor=null;
 await assert.rejects(()=>security(req('GET'),res,'/auth/me'),e=>e.status===401);
});

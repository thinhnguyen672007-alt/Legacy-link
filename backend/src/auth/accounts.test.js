import test from 'node:test';
import assert from 'node:assert/strict';
import {hashPassword,verifyPassword,tokenHash} from './accounts.js';
import {accountSecurity} from './security.js';
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

import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {ActivationGrants,validOrigin} from '../connector/2026-10-31-activation.mjs';
import {createConnector} from '../connector/2026-10-31-server.mjs';
const secret='a'.repeat(64),challenge=createHash('sha256').update(secret).digest('hex');
test('activation is exact origin, fresh and single use',()=>{
 const g=new ActivationGrants();assert.ok(g.approve({origin:'https://site.test',challenge,createdAt:1000},1000));
 assert.equal(g.claim('https://evil.test',secret,1001),false);assert.ok(g.claim('https://site.test',secret,1001));assert.equal(g.claim('https://site.test',secret,1001),false);
 assert.equal(g.approve({origin:'http://evil.test',challenge,createdAt:1000},1000),false);
 assert.equal(g.approve({origin:'https://site.test',challenge,createdAt:1000},130000),false);
 assert.equal(validOrigin('https://site.test/path'),false);
});
test('HTTP claim requires native grant and cannot replay',async t=>{
 const c=await createConnector({port:0,autoExit:false,provider:{close:async()=>{}}});t.after(()=>c.close());
 const post=origin=>fetch(`http://127.0.0.1:${c.port}/api/claim`,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({secret,tabId:'one'})});
 assert.equal((await post('https://site.test')).status,403);
 assert.ok(c.approveActivation({origin:'https://site.test',challenge,createdAt:Date.now()}));
 assert.equal((await post('https://evil.test')).status,403);const r=await post('https://site.test');assert.equal(r.status,200);assert.equal((await r.json()).token.length,64);assert.equal((await post('https://site.test')).status,401);
});

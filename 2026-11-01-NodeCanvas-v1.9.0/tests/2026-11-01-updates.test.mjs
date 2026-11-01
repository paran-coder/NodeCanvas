import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign,createHash} from 'node:crypto';
import {mkdtemp,mkdir,readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {verifyRelease,UpdateManager} from '../connector/2026-11-01-updates.mjs';
const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
const pem=publicKey.export({type:'spki',format:'pem'}),bytes=Buffer.from('test executable');
const release={schema:1,version:'1.9.1',url:'https://nodenanvas.vercel.app/2026-10-31-NodeCanvas-Setup-v1.9.1.exe',size:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};
const envelope=value=>{const payload=Buffer.from(JSON.stringify(value)).toString('base64');return {payload,signature:sign('sha256',Buffer.from(payload),privateKey).toString('base64')};};
test('signed releases reject tampering, foreign origins, traversal, rollback and invalid budgets',()=>{
 assert.equal(verifyRelease(envelope(release),pem,'1.9.0').version,'1.9.1');
 assert.equal(verifyRelease(envelope({...release,version:'1.9.0',url:release.url.replaceAll('1.9.1','1.9.0')}),pem,'1.9.0'),null);
 const bad=envelope(release);bad.signature=bad.signature.slice(0,-8)+'AAAAAAAA';assert.throws(()=>verifyRelease(bad,pem,'1.9.0'));
 for(const patch of [{url:'https://evil.test/a.exe'},{url:'https://nodenanvas.vercel.app/../a.exe'},{version:'1.8.2'},{size:30e6},{sha256:'bad'}])assert.throws(()=>verifyRelease(envelope({...release,...patch}),pem,'1.9.0'));
});
test('downloads only verified bytes; repeated checks share work; apply rechecks cache and blocks busy work',async()=>{
 const root=fileURLToPath(new URL('../.runtime/update-tests/',import.meta.url));await mkdir(root,{recursive:true});const dir=await mkdtemp(root+'case-');let downloads=0,applied=0;
 const manager=new UpdateManager({directory:dir,publicKey:pem,current:'1.9.0',fetcher:async url=>{downloads++;return new Response(url.endsWith('.json')?JSON.stringify(envelope(release)):bytes);},apply:async()=>{applied++;}});
 await Promise.all([manager.check(),manager.check()]);assert.equal(downloads,2);assert.equal(manager.status().state,'ready');
 await assert.rejects(manager.apply({busy:true}),/작업/);assert.equal(applied,0);
 await manager.apply();assert.equal(applied,1);assert.equal(manager.status().state,'applying');
 assert.ok(!JSON.stringify(manager.status()).includes(dir));
});
test('corrupt download is never executable or ready',async()=>{
 const root=fileURLToPath(new URL('../.runtime/update-tests/',import.meta.url));await mkdir(root,{recursive:true});const dir=await mkdtemp(root+'case-');
 const manager=new UpdateManager({directory:dir,publicKey:pem,current:'1.9.0',fetcher:async url=>new Response(url.endsWith('.json')?JSON.stringify(envelope(release)):'corrupt'),apply:async()=>assert.fail('must not apply')});
 await manager.check();assert.equal(manager.status().state,'error');await assert.rejects(manager.apply());
});

import {createConnector} from '../connector/2026-10-31-server.mjs';
import {updatePresentation} from '../web/2026-11-01-updates.mjs';
test('update UI clearly disables applying during work and keeps ready state',()=>{
 assert.equal(updatePresentation({state:'ready',message:'ready'},true).disabled,true);
 assert.match(updatePresentation({state:'ready'},true).message,/현재 작업/);
 assert.equal(updatePresentation({state:'ready'},false).disabled,false);
});
test('update API requires trusted pairing, rejects active jobs, and excludes new jobs while applying',async t=>{
 let finish;const gate=new Promise(r=>{finish=r;});let calls=0;
 const provider={close:async()=>{},generate:async()=>{await gate;return {images:[]};},cancel:async()=>{finish();}};
 const updater={status:()=>({state:'ready',version:'1.9.1'}),check:async()=>{},close:()=>{},apply:async({activation})=>{assert.match(activation,/origin=http%3A%2F%2F127/);calls++;return {state:'applying'};}};
 const c=await createConnector({port:0,pairCode:'123456789abc',autoExit:false,provider,updateManager:updater});t.after(()=>{finish();return c.close();});
 const base=`http://127.0.0.1:${c.port}`;let token='';const post=(route,data={},origin=base)=>fetch(base+'/api/'+route,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify(data)});
 assert.equal((await post('update/apply',{challenge:'a'.repeat(64)})).status,401);
 token=(await (await post('pair',{code:'123456789abc',tabId:'up'})).json()).token;
 assert.equal((await post('update/apply',{challenge:'a'.repeat(64)},'https://evil.test')).status,403);
 assert.equal((await post('update/apply',{challenge:'invalid'})).status,400);
 const job=await (await post('jobs',{prompt:'wait'})).json();
 assert.equal((await post('update/apply',{challenge:'a'.repeat(64)})).status,409);assert.equal(calls,0);
 finish();for(let i=0;i<20;i++){const j=await (await post('job',{id:job.id})).json();if(j.state!=='running')break;await new Promise(r=>setTimeout(r,5));}
 assert.equal((await post('update/apply',{challenge:'a'.repeat(64)})).status,202);assert.equal(calls,1);
 assert.equal((await post('jobs',{prompt:'second'})).status,409);
 assert.equal((await post('update/apply',{challenge:'a'.repeat(64)})).status,409);
});

test('pending external login prevents applying until account status confirms completion',async t=>{
 let account=null;const provider={close:async()=>{},login:async()=>({authUrl:'https://auth.openai.com/test'}),status:async()=>({account})};
 const updateManager={status:()=>({state:'ready'}),close:()=>{},apply:async()=>({state:'applying'})};
 const c=await createConnector({port:0,pairCode:'123456789abc',autoExit:false,provider,updateManager});t.after(()=>c.close());
 const base=`http://127.0.0.1:${c.port}`;let token='';const post=(route,data={})=>fetch(base+'/api/'+route,{method:'POST',headers:{Origin:base,'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify(data)});
 token=(await (await post('pair',{code:'123456789abc',tabId:'login'})).json()).token;
 await post('login');assert.equal((await post('update/apply',{challenge:'a'.repeat(64)})).status,409);
 account={type:'chatgpt'};await post('status');assert.equal((await post('update/apply',{challenge:'a'.repeat(64)})).status,202);
});

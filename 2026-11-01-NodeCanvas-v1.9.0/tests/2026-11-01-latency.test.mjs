import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdir,mkdtemp} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {CodexProvider} from '../connector/2026-10-31-codex.mjs';
test('image arrives before turn finishes and timings increase',async t=>{
 const root=fileURLToPath(new URL('../.runtime/latency/',import.meta.url));await mkdir(root,{recursive:true});
 const home=await mkdtemp(root+'case-');
 const p=new CodexProvider(home,{spawnProcess:()=>spawn(process.execPath,[fileURLToPath(new URL('./2026-10-31-rpc-fixture.mjs',import.meta.url))],{stdio:['pipe','pipe','pipe'],windowsHide:true})});t.after(()=>p.close());
 let early=false;const stages=[];
 const result=await p.generate({prompt:'delayed-finish',ratio:'3:2'},{onImage:image=>{early=true;assert.match(image,/^data:image\/png/);assert.ok(p.active);},onTiming:timing=>stages.push(timing)});
 assert.equal(early,true);assert.equal(result.images.length,1);
 assert.ok(stages.some(s=>s.stage==='imageReady'));assert.equal(stages.at(-1).stage,'completed');
 assert.ok(stages.every((s,i)=>Number.isFinite(s.elapsedMs)&&s.elapsedMs>=0&&(!i||s.elapsedMs>=stages[i-1].elapsedMs)));
 assert.ok(stages.at(-1).elapsedMs-stages.find(s=>s.stage==='imageReady').elapsedMs>=150);
 assert.equal(p.active,null);
});

import {createConnector} from '../connector/2026-10-31-server.mjs';
test('HTTP exposes completed image while turn remains busy, with no second generation',async t=>{
 let release;const gate=new Promise(r=>{release=r;});
 const image='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
 const provider={close:async()=>{},generate:async(_,o)=>{o.onTiming({stage:'imageReady',elapsedMs:12});o.onImage(image);await gate;return {images:[image]};}};
 const c=await createConnector({port:0,pairCode:'123456789abc',autoExit:false,provider});t.after(()=>{release();return c.close();});
 const base=`http://127.0.0.1:${c.port}`;let token='';
 const post=(route,data={})=>fetch(base+'/api/'+route,{method:'POST',headers:{Origin:base,'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify(data)});
 token=(await (await post('pair',{code:'123456789abc',tabId:'latency'})).json()).token;
 const {id}=await (await post('jobs',{prompt:'test'})).json();
 const job=await (await post('job',{id})).json();
 assert.equal(job.state,'running');assert.deepEqual(job.images,[image]);assert.equal(job.timings[0].elapsedMs,12);
 assert.equal((await post('jobs',{prompt:'second'})).status,409);
 release();
 let final;for(let i=0;i<10;i++){final=await (await post('job',{id})).json();if(final.state==='completed')break;await new Promise(r=>setTimeout(r,10));}
 assert.equal(final.state,'completed');assert.deepEqual(final.images,[image]);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { createConnector } from '../connector/2026-10-31-server.mjs';
import { decodeImageItem, validateJob } from '../connector/2026-10-31-codex.mjs';

const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
test('image result requires real image bytes; text-only completion cannot succeed', async()=>{
  assert.equal(await decodeImageItem({type:'agentMessage',text:'done'},'.'),null);
  assert.equal(await decodeImageItem({type:'imageGeneration',status:'completed',result:png.split(',')[1]},'.'),png);
  await assert.rejects(decodeImageItem({type:'imageGeneration',status:'completed',result:'success'},'.'),/이미지/);
  await assert.rejects(decodeImageItem({type:'imageGeneration',status:'failed',result:'',failure:{message:'limit'}},'.'));
});
test('job input rejects empty prompts, external URLs and edit without reference',()=>{
  assert.throws(()=>validateJob({prompt:''}));
  assert.throws(()=>validateJob({prompt:'edit',kind:'edit',images:[]}));
  assert.throws(()=>validateJob({prompt:'x',images:['https://evil.test/x.png']}));
  assert.equal(validateJob({prompt:'forest',kind:'generate',images:[png],ratio:'3:2'}).ratio,'3:2');
});
test('a large generated image can be passed to the next edit node',async()=>{
  const bytes=Buffer.alloc(10_000_000);Buffer.from([137,80,78,71,13,10,26,10]).copy(bytes);
  const image=await decodeImageItem({type:'imageGeneration',status:'completed',result:bytes.toString('base64')},'.');
  assert.equal(validateJob({prompt:'warmer light',kind:'edit',images:[image]}).images.length,1);
});
test('HTTP connector enforces origin and pairing before job or status access',async(t)=>{
  const connector=await createConnector({port:0,origins:['https://canvas.vercel.app'],pairCode:'123456789abc',autoExit:false,provider:{close:async()=>{},status:async()=>({installed:true,account:null})}});
  t.after(()=>connector.close());
  const base=`http://127.0.0.1:${connector.port}`;
  const post=(path,body={},headers={})=>fetch(base+path,{method:'POST',headers:{Origin:'https://canvas.vercel.app','Content-Type':'application/json',...headers},body:JSON.stringify(body)});
  assert.equal((await post('/api/status')).status,401);
  assert.equal((await post('/api/pair',{code:'123456789abc',tabId:'one'},{Origin:'https://evil.test'})).status,403);
  assert.equal((await post('/api/pair',{code:'wrong',tabId:'one'})).status,401);
  const response=await post('/api/pair',{code:'123456789abc',tabId:'one'}); assert.equal(response.status,200);
  const {token}=await response.json();assert.ok(token.length>=32);
  const status=await post('/api/status',{}, {Authorization:`Bearer ${token}`});assert.equal(status.status,200);assert.equal((await status.json()).installed,true);
  assert.equal((await post('/api/heartbeat',{tabId:'two'},{Authorization:`Bearer ${token}`})).status,200);
  assert.equal((await post('/api/jobs',{prompt:''},{Authorization:`Bearer ${token}`})).status,400);
  assert.equal((await fetch(base+'/api/status')).status,405);
  const controller=new AbortController();
  const stream=await fetch(base+'/api/lease',{method:'POST',headers:{Origin:'https://canvas.vercel.app','Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({tabId:'stream-tab'}),signal:controller.signal});
  assert.equal(stream.status,200);assert.match(stream.headers.get('content-type'),/text\/event-stream/);controller.abort();
});
test('pairing attempts are bounded without exposing a token',async(t)=>{
  const c=await createConnector({port:0,pairCode:'123456789abc',autoExit:false,provider:{close:async()=>{}}});t.after(()=>c.close());
  let response;
  for(let i=0;i<12;i++) response=await fetch(`http://127.0.0.1:${c.port}/api/pair`,{method:'POST',headers:{Origin:`http://127.0.0.1:${c.port}`,'Content-Type':'application/json'},body:JSON.stringify({code:'wrong',tabId:'tab'})});
  assert.equal(response.status,429);
});
test('authentication changes exclude concurrent jobs and other auth changes',async(t)=>{
  let finishLogin,entered;
  const enteredLogin=new Promise(resolve=>{entered=resolve;});
  const waiting=new Promise(resolve=>{finishLogin=resolve;});
  const provider={close:async()=>{},login:async()=>{entered();await waiting;return {alreadyLoggedIn:true};},logout:async()=>({ok:true}),generate:async()=>({images:[png]})};
  const c=await createConnector({port:0,pairCode:'123456789abc',autoExit:false,provider});t.after(()=>c.close());
  const base=`http://127.0.0.1:${c.port}`;
  let token='';
  const post=(route,data={})=>fetch(base+'/api/'+route,{method:'POST',headers:{Origin:base,'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify(data)});
  token=(await (await post('pair',{code:'123456789abc',tabId:'a'})).json()).token;
  const login=post('login');await enteredLogin;
  const job=await post('jobs',{prompt:'forest'}),logout=await post('logout');
  finishLogin();await login;
  assert.equal(job.status,409);assert.equal(logout.status,409);
});

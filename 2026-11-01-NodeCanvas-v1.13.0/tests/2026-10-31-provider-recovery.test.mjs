import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {PassThrough,Writable} from 'node:stream';
import {mkdir,mkdtemp,readdir,writeFile,utimes} from 'node:fs/promises';
import path from 'node:path';
import {CodexProvider} from '../connector/2026-10-31-codex.mjs';
const root=new URL('../.runtime/2026-10-31-recovery/',import.meta.url);
async function home(){await mkdir(root,{recursive:true});return mkdtemp(path.join(fileURLToPath(root),'case-'));}
function peer(mode='ok'){
 const p=new EventEmitter();p.stdout=new PassThrough();p.stderr=new PassThrough();p.exitCode=null;p.stopped=false;
 p.kill=()=>{p.stopped=true;p.exitCode=0;p.emit('exit',0);};
 p.stdin=new Writable({write(chunk,encoding,done){const m=JSON.parse(chunk);done();if(!m.id)return;queueMicrotask(()=>{if(m.method==='initialize'&&mode==='hang')return;if(m.method==='initialize'&&mode==='error'){p.emit('error',new Error('transport failed'));return;}const error=m.method==='initialize'&&mode==='reject'?{message:'initialize rejected'}:null;p.stdout.write(JSON.stringify({id:m.id,...(error?{error}:{result:{}})})+'\n');});}});
 p.stdin.on('finish',()=>p.kill());return p;
}
test('two rejected initialization attempts are both disposed before shutdown',async()=>{const peers=[];const p=new CodexProvider(await home(),{spawnProcess:()=>{const x=peer('reject');peers.push(x);return x;}});await assert.rejects(p.start());await assert.rejects(p.start());await p.shutdown();assert.equal(peers.length,2);assert.ok(peers.every(x=>x.stopped));assert.equal(p.pending.size,0);});
test('retry succeeds and stale old process errors cannot reject current RPCs',async()=>{const peers=[];const p=new CodexProvider(await home(),{spawnProcess:()=>{const x=peer(peers.length?'ok':'reject');peers.push(x);return x;}});await assert.rejects(p.start());await p.start();peers[0].emit('exit',1);assert.deepEqual(await p.rpc('account/read'),{});await p.shutdown();assert.ok(peers.every(x=>x.stopped));});
test('transport error tears down failed initialization',async()=>{const x=peer('error');const p=new CodexProvider(await home(),{spawnProcess:()=>x});await assert.rejects(p.start(),/transport/);assert.equal(x.stopped,true);await p.shutdown();});
test('close during pending initialization disposes transport and rejects start',async()=>{const x=peer('hang');let launched;const spawned=new Promise(r=>launched=r);const p=new CodexProvider(await home(),{spawnProcess:()=>{launched();return x;}});const starting=p.start();await spawned;await p.close();await assert.rejects(starting);assert.equal(x.stopped,true);assert.equal(p.pending.size,0);});
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {symlink,lstat} from 'node:fs/promises';
const fixture=fileURLToPath(new URL('./2026-10-31-rpc-fixture.mjs',import.meta.url));
function realPeer(){return spawn(process.execPath,[fixture],{stdio:['pipe','pipe','pipe'],windowsHide:true});}
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
for(const mode of ['success','failure','cancel','thread-setup','turn-setup','reference-setup'])test(`owned job references removed after ${mode}`,async(t)=>{
 const dir=await home();const p=new CodexProvider(dir,{spawnProcess:realPeer});t.after(()=>p.shutdown());
 const rpc=p.rpc.bind(p);p.rpc=(method,...args)=>{if((mode==='thread-setup'&&method==='thread/start')||(mode==='turn-setup'&&method==='turn/start'))return Promise.reject(new Error('setup fixture failure'));return rpc(method,...args);};
 if(mode==='reference-setup'){await mkdir(path.join(dir,'jobs'),{recursive:true});await writeFile(path.join(dir,'jobs','keep.txt'),'retained');p.removeJob=async function(directory){assert.ok(this.ownedJobs.has(directory));return CodexProvider.prototype.removeJob.call(this,directory);};}
 const controller=new AbortController();
 const operation=p.generate({prompt:mode==='cancel'?'slow-test':'forest',ratio:mode==='failure'?'1:1':'3:2',images:[png]},{signal:controller.signal,onProgress:()=>{if(mode==='cancel')controller.abort();if(mode==='reference-setup')throw new Error('setup fixture failure');}});
 if(mode==='success')assert.equal((await operation).images.length,1);else await assert.rejects(operation);
 assert.deepEqual((await readdir(path.join(dir,'jobs'))).filter(x=>x!=='keep.txt'),[]);assert.equal(p.ownedJobs.size,0);
});
test('startup removes old UUID orphans while retaining recent and nonowned paths and links',async(t)=>{
 const dir=await home();const jobs=path.join(dir,'jobs');await mkdir(jobs);const old='11111111-1111-4111-8111-111111111111',recent='22222222-2222-4222-8222-222222222222';
 for(const name of [old,recent,'custom-folder'])await mkdir(path.join(jobs,name));
 await utimes(path.join(jobs,old),new Date(0),new Date(0));const outside=path.join(dir,'retained-target');await mkdir(outside);await writeFile(path.join(outside,'keep'),'keep');
 const link=path.join(jobs,'33333333-3333-4333-8333-333333333333');let linked=true;try{await symlink(outside,link,'junction');}catch(error){if(error.code!=='EPERM')throw error;linked=false;t.diagnostic('Windows sandbox denies junction creation; real-link branch unavailable.');}
 const p=new CodexProvider(dir,{spawnProcess:realPeer});t.after(()=>p.shutdown());await p.start();
 assert.deepEqual((await readdir(jobs)).sort(),[recent,'custom-folder',...(linked?[path.basename(link)]:[])].sort());if(linked)assert.equal((await lstat(link)).isSymbolicLink(),true);assert.deepEqual(await readdir(outside),['keep']);
});
test('RPC timeout disposes failed initialization before another start',async()=>{const x=peer('hang');const p=new CodexProvider(await home(),{spawnProcess:()=>x});const rpc=p.rpc.bind(p);p.rpc=(method,params)=>rpc(method,params,10);await assert.rejects(p.start(),/시간 초과/);assert.equal(x.stopped,true);await p.shutdown();});

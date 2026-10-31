import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdir,mkdtemp,readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {CodexProvider,launchCommand} from '../connector/2026-10-31-codex.mjs';
const root=path.resolve(fileURLToPath(new URL('../.runtime/2026-10-31-tests',import.meta.url)));
const fixture=fileURLToPath(new URL('./2026-10-31-rpc-fixture.mjs',import.meta.url));
async function home(){await mkdir(root,{recursive:true});return mkdtemp(path.join(root,'case-'));}
function peer(){return spawn(process.execPath,[fixture],{stdio:['pipe','pipe','pipe'],windowsHide:true});}
test('Windows npm CLI launches bin JS through Node without invoking a shell',()=>{
  const command=launchCommand({NODECANVAS_CODEX_JS:'C:\\npm\\codex.js'},['app-server']);
  assert.equal(command.command,process.execPath);assert.deepEqual(command.args,['C:\\npm\\codex.js','app-server']);
});
test('saved keyring preference is restored by the next connector process',async(t)=>{
  const dir=await home();const p=new CodexProvider(dir,{spawnProcess:peer});t.after(()=>p.close());
  await p.login(true);await p.close();
  const q=new CodexProvider(dir,{spawnProcess:peer});t.after(()=>q.close());
  assert.equal((await q.status()).storage,'keyring');
  const preferences=JSON.parse(await readFile(path.join(dir,'2026-10-31-auth-preference.json'),'utf8'));assert.equal(preferences.storage,'keyring');
});
test('provider receives immediate image events and returns bytes, not agent text',async(t)=>{
  const p=new CodexProvider(await home(),{spawnProcess:peer});t.after(()=>p.close());
  const result=await p.generate({prompt:'forest',ratio:'3:2'});
  assert.equal(result.images.length,1);assert.match(result.images[0],/^data:image\/png;base64,/);
});
test('cancelling before turn/start reply interrupts the newly assigned turn',async(t)=>{
  const p=new CodexProvider(await home(),{spawnProcess:peer});t.after(()=>p.close());
  const controller=new AbortController();let started;
  const inStart=new Promise(resolve=>{started=resolve;});
  const result=p.generate({prompt:'slow-test',ratio:'3:2'},{signal:controller.signal,onProgress:message=>{if(message.includes('요청합니다'))started();}});
  await inStart;controller.abort();await assert.rejects(result,/취소/);
  assert.equal(p.active,null);
  const next=await p.generate({prompt:'forest',ratio:'3:2'});assert.equal(next.images.length,1);
});
test('closing during asynchronous initialization cannot launch an orphan process',async()=>{
  let launched=0;
  const p=new CodexProvider(await home(),{spawnProcess:(...args)=>{launched++;return peer(...args);}});
  const starting=p.start();
  await p.close();await starting.catch(()=>{});
  const count=launched;await p.close();assert.equal(count,0);
});

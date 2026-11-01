import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {createConnector} from '../connector/2026-10-31-server.mjs';
import {HAIRLOCK} from '../web/2026-11-01-skills.mjs';
const require=createRequire('C:/Users/C/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json');
const {chromium}=require('playwright');
const output=fileURLToPath(new URL('../.runtime/2026-11-01-hairlock-browser/',import.meta.url));await mkdir(output,{recursive:true});
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
const server=await createConnector({port:0,autoExit:false,provider:{close:async()=>{}}});let browser;
try{
 browser=await chromium.launch({headless:true,executablePath:'C:/Users/C/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe'});
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],requests=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>sessionStorage.setItem('nodecanvas-bridge','test-token'));
 await page.route('http://127.0.0.1:7330/api/**',async route=>{
  const name=new URL(route.request().url()).pathname;let data={ok:true};
  if(name==='/api/status')data={installed:true,account:{type:'chatgpt'},storage:'keyring'};
  if(name.startsWith('/api/update/'))data={state:'current',message:'최신 연결 앱입니다.'};
  if(name==='/api/jobs'){requests.push(route.request().postDataJSON());data={id:'test-job'};}
  if(name==='/api/job')data={state:'completed',images:[png],message:'완료'};
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
 });
 const base=`http://127.0.0.1:${server.port}`;await page.goto(base);
 await page.waitForSelector('#spaces-grid .space-card');
 await page.evaluate(async png=>{const {addSpace}=await import('/2026-10-31-storage.mjs');const {editProject}=await import('/2026-10-31-graph.mjs');const p=editProject();p.name='HairLock 검증';p.nodes[0].data.image=png;p.nodes[1].data.text='얼굴과 배경은 유지하고 앞머리 있는 단발로 바꿔 주세요.';await addSpace(p);},png);
 await page.reload();await page.getByRole('button',{name:'HairLock 검증',exact:true}).click();
 const select=page.locator('[data-node="edit-start"] select[data-field="skill"]');
 await select.selectOption(HAIRLOCK.id);
 await page.locator('[data-node="edit-start"] [data-action="skill-view"]').click();
 assert.equal(await page.locator('#hairlock-source').textContent(),HAIRLOCK.text);
 await page.locator('#hairlock-dialog .modal-close').click();
 await page.locator('[data-run="edit-start"]').click();await page.waitForFunction(()=>!document.getElementById('run-all').disabled);
 assert.equal(requests.length,1);assert.equal(requests[0].kind,'edit');assert.equal(requests[0].images[0],png);assert.equal(requests[0].prompt.split(HAIRLOCK.text).length,2);assert.ok(requests[0].prompt.endsWith('얼굴과 배경은 유지하고 앞머리 있는 단발로 바꿔 주세요.'));
 await page.screenshot({path:output+'2026-11-01-hairlock-desktop.png'});
 await page.waitForFunction(()=>document.getElementById('save-state').dataset.state==='saved');
 await page.reload();await page.getByRole('button',{name:'HairLock 검증',exact:true}).click();assert.equal(await select.inputValue(),HAIRLOCK.id);
 await select.click();await select.selectOption('');await page.screenshot({path:output+'2026-11-01-before-second-run.png'});await page.locator('[data-run="edit-start"]').click();await page.waitForFunction(()=>!document.getElementById('run-all').disabled);
 assert.equal(requests.length,2);assert.ok(!requests[1].prompt.includes(HAIRLOCK.text));
 const original=fileURLToPath(new URL('../web/2026-11-01-hairlock.md',import.meta.url));
 await page.locator('[data-action="skill-import"]').click();await page.locator('#skill-file').setInputFiles(original);await page.waitForFunction(()=>document.querySelector('[data-field="skill"]').value==='hairlock-v1.0.1');
 await select.selectOption('');await writeFile(output+'2026-11-01-invalid.md','not HairLock');await page.locator('[data-action="skill-import"]').click();await page.locator('#skill-file').setInputFiles(output+'2026-11-01-invalid.md');await page.waitForFunction(()=>document.getElementById('toast').textContent.includes('원본 SKILL.md'));assert.equal(await select.inputValue(),'');
 await select.selectOption(HAIRLOCK.id);await page.locator('[data-action="skill-view"]').click();await page.setViewportSize({width:390,height:844});await page.screenshot({path:output+'2026-11-01-hairlock-mobile.png'});
 assert.equal(await page.evaluate(()=>document.getElementById('hairlock-dialog').scrollWidth>document.getElementById('hairlock-dialog').clientWidth+2),false);assert.deepEqual(errors,[]);
 await writeFile(output+'2026-11-01-browser-result.json',JSON.stringify({status:'PASS',originalText:true,requestWithSkill:true,requestWithoutSkill:true,saveReload:true,validImport:true,invalidImportRejected:true,mobileOverflow:false,pageErrors:errors,realImageGeneration:false},null,2));
 console.log('PASS: original text, edit request with/without skill, reload persistence, MD upload/invalid rejection, PC/mobile, no JS errors. AI requests mocked.');
}finally{await browser?.close();await server.close();}

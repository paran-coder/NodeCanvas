import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {createConnector} from '../connector/2026-10-31-server.mjs';
const require=createRequire('C:/Users/C/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json');
const {chromium}=require('playwright');
const output=fileURLToPath(new URL('../.runtime/2026-11-01-browser/',import.meta.url));await mkdir(output,{recursive:true});
const server=await createConnector({port:0,autoExit:false,provider:{close:async()=>{}}});
let browser;
try{
 browser=await chromium.launch({headless:true,executablePath:'C:/Users/C/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe'});
 const page=await browser.newPage({viewport:{width:1366,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));let applied=0,claims=0;
 await page.addInitScript(()=>sessionStorage.setItem('nodecanvas-bridge','test-token'));
 await page.route('http://127.0.0.1:7330/api/**',async route=>{
  const name=new URL(route.request().url()).pathname;let data={ok:true};
  if(name==='/api/status')data={installed:true,account:{type:'chatgpt',email:'test@example.test',plan:'test'},storage:'keyring'};
  if(name==='/api/update/status'||name==='/api/update/check')data={state:'ready',version:'1.9.1',message:'연결 앱 v1.9.1 업데이트 준비 완료'};
  if(name==='/api/update/apply'){assert.match(route.request().postDataJSON().challenge,/^[a-f0-9]{64}$/);applied++;data={state:'applying'};}
  if(name==='/api/claim'){claims++;data={token:'new-token',version:'1.9.1'};}
  if(name==='/api/lease'){await route.fulfill({status:200,contentType:'text/event-stream',body:': test\n\n'});return;}
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
 });
 await page.goto(`http://127.0.0.1:${server.port}/`);
 await page.waitForFunction(()=>document.getElementById('connection-label')?.textContent==='ChatGPT 연결됨');
 await page.evaluate(()=>document.getElementById('connect-open').click());
 await page.locator('#connector-update').waitFor({state:'visible'});
 await page.waitForFunction(()=>!document.getElementById('update-apply').disabled);
 await page.screenshot({path:output+'2026-11-01-update-desktop.png'});
 await page.locator('#update-apply').click();
 await page.waitForFunction(()=>sessionStorage.getItem('nodecanvas-bridge')==='new-token');
 await page.waitForFunction(()=>!document.getElementById('run-all').disabled);
 assert.equal(applied,1);assert.equal(claims,1);assert.deepEqual(errors,[]);
 await page.setViewportSize({width:390,height:844});
 await page.screenshot({path:output+'2026-11-01-update-mobile.png'});
 const overflow=await page.evaluate(()=>document.querySelector('#connect-dialog').scrollWidth>document.querySelector('#connect-dialog').clientWidth+2);assert.equal(overflow,false);
 await writeFile(output+'2026-11-01-browser-result.json',JSON.stringify({applied,claims,pageErrors:errors,mobileOverflow:overflow,realNativeUpdate:false},null,2));
 console.log('PASS: actual app page, ready UI, apply challenge, renewed token, reconnect, desktop/mobile layout. Mock native/network only.');
}finally{await browser?.close();await server.close();}

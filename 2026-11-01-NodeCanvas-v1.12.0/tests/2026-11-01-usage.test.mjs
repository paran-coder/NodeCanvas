import test from 'node:test';
import assert from 'node:assert/strict';
import {projectUsage,usageNotice,storageSummary,formatStorageBytes,usageLevel} from '../web/2026-11-01-usage.mjs';
import {MAX_PROJECT_BYTES,projectBytes} from '../web/2026-10-31-graph.mjs';
import {createConnector} from '../connector/2026-10-31-server.mjs';
const graph=(nodes=0,edges=0)=>({version:'1.0.0',name:'사용량',nodes:Array.from({length:nodes},(_,i)=>({id:'n'+i,type:'prompt',x:0,y:0,data:{text:'메모'}})),edges:Array.from({length:edges},(_,i)=>({id:'e'+i,from:'n0',to:'n1'}))});
test('early warning begins at exactly 80 percent; full and exceeded limits are distinct',()=>{
 for(const maximum of [150,500,MAX_PROJECT_BYTES]){
  assert.equal(usageLevel(maximum*.8-1,maximum),'normal');
  assert.equal(usageLevel(maximum*.8,maximum),'near');
  assert.equal(usageLevel(maximum-1,maximum),'near');
  assert.equal(usageLevel(maximum,maximum),'full');
  assert.equal(usageLevel(maximum+1,maximum),'exceeded');
 }
});
test('project counts and byte budget track the same model as saving, including repeated image references',()=>{
 const g=graph(120,400),metrics=projectUsage(g);
 assert.deepEqual(metrics.map(m=>m.level),['near','near','normal']);
 assert.equal(metrics[2].value,projectBytes(g));
 const image='data:image/png;base64,'+'A'.repeat(20_000_000),big=graph(8);
 big.nodes.forEach(n=>{n.type='image';n.data.image=image;});
 const b=projectUsage(big)[2];assert.equal(b.level,'near');assert.ok(b.value>160_000_000&&b.value<161_000_000);
 big.nodes.pop();assert.equal(projectUsage(big)[2].level,'normal');
});
test('persistent warning text does not repeat for ordinary edits and clears below threshold or on project switch',()=>{
 const a=usageNotice(projectUsage(graph(120))),b=usageNotice(projectUsage(graph(121)));
 assert.equal(a.text,b.text);assert.equal(a.severity,'warning');assert.match(a.text,/노드/);
 assert.equal(usageNotice(projectUsage(graph(119))).text,'');
 assert.equal(usageNotice(projectUsage(graph())).text,'');
 assert.equal(usageNotice(projectUsage(graph(150))).severity,'danger');
 assert.notEqual(usageNotice(projectUsage(graph(150))).text,a.text);
});
test('storage estimate describes the whole site and handles partial or unavailable estimates without invented zeroes',()=>{
 assert.equal(storageSummary({usage:500_000,quota:10_738_000_000}),'이 사이트 전체 저장량: 0.5MB · 브라우저 허용량: 약 10.7GB');
 assert.match(storageSummary({usage:0}),/0.0MB.*허용량: 확인 불가/);
 assert.match(storageSummary({quota:2_000_000_000}),/저장량: 확인 불가.*약 2.0GB/);
 assert.match(storageSummary({usage:-1,quota:Infinity}),/저장량: 확인 불가.*허용량: 확인 불가/);
 assert.match(storageSummary({usage:NaN,quota:0}),/저장량: 확인 불가.*허용량: 확인 불가/);
 assert.equal(formatStorageBytes(999_000_000),'999.0MB');assert.equal(formatStorageBytes(1_000_000_000),'1.0GB');
});
test('new usage module is available through the real connector static route',async t=>{
 const c=await createConnector({port:0,autoExit:false,provider:{close:async()=>{}}});t.after(()=>c.close());
 const r=await fetch(`http://127.0.0.1:${c.port}/2026-11-01-usage.mjs`);assert.equal(r.status,200);assert.match(r.headers.get('content-type'),/javascript/);assert.match(await r.text(),/export function projectUsage/);
});

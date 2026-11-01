import test from 'node:test';
import assert from 'node:assert/strict';
import {promptPresentation} from '../web/2026-11-01-node-layout.mjs';
import {collectInputs} from '../web/2026-10-31-graph.mjs';
import {createConnector} from '../connector/2026-10-31-server.mjs';
const node=(id,type,text='')=>({id,type,data:{text,label:id}});
test('direct prompts and optional shared text have different guidance, even when connected text is empty',()=>{
 const n=node('g','generate'),p=node('p','prompt','shared'),g={nodes:[p,n],edges:[]};
 assert.equal(promptPresentation(g,n).label,'프롬프트');
 g.edges.push({from:'p',to:'g'});
 assert.equal(promptPresentation(g,n).label,'추가 지시사항 (선택)');
 assert.deepEqual(promptPresentation(g,n).sources,[{id:'p',label:'p',empty:false}]);
 p.data.text='';assert.equal(promptPresentation(g,n).sources[0].empty,true);
 g.edges=[];assert.equal(promptPresentation(g,n).sources.length,0);
 assert.equal(promptPresentation(g,node('e','edit')).label,'편집 지시');
});
test('shared and inline instructions are sent once and remain separately editable',()=>{
 const p=node('p','prompt','shared'),n=node('g','generate','extra'),g={nodes:[p,n],edges:[{from:'p',to:'g'}]};
 const inputs=collectInputs(g,'g',{p:{text:p.data.text,images:[]}});
 assert.equal([inputs.text,n.data.text].filter(Boolean).join('\n\n'),'shared\n\nextra');
 assert.equal(n.data.text,'extra');
});
test('connector serves the shared prompt presentation module without account access',async t=>{
 const connector=await createConnector({port:0,autoExit:false,provider:{close:async()=>{}}});t.after(()=>connector.close());
 const response=await fetch(`http://127.0.0.1:${connector.port}/2026-11-01-node-layout.mjs`);
 assert.equal(response.status,200);assert.match(response.headers.get('content-type'),/javascript/);assert.match(await response.text(),/export function promptPresentation/);
});

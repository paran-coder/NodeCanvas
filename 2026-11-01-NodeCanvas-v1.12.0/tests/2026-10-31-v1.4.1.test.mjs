import test from 'node:test';
import assert from 'node:assert/strict';
import {nodeDragAllowed,uploadClick} from '../web/2026-10-31-canvas.mjs';
import {TYPES,restoreProject,starterProject} from '../web/2026-10-31-graph.mjs';
import {CATALOG,NODE_HELP} from '../web/2026-10-31-catalog.mjs';
test('upload surface button supports drag while normal buttons do not',()=>{assert.equal(nodeDragAllowed({closest:()=>({hasAttribute:n=>n==='data-upload-surface'})}),true);assert.equal(nodeDragAllowed({closest:()=>({hasAttribute:()=>false})}),false);});
test('node names and help describe actual input/output roles',()=>{assert.equal(TYPES.image.label,'이미지 업로드');assert.equal(CATALOG.find(x=>x.type==='image').label,'이미지 업로드');for(const type of Object.keys(TYPES)){assert.ok(NODE_HELP[type].summary.length>10);assert.ok(NODE_HELP[type].example.length>5);}assert.equal(NODE_HELP.result,undefined);});
test('custom generator labels survive normalization',()=>{const g=starterProject();g.nodes[0].data.label='내 최종 선택';assert.equal(restoreProject(JSON.stringify(g)).nodes[0].data.label,'내 최종 선택');});

import {createConnector} from '../connector/2026-10-31-server.mjs';
test('presence exposes only app identity to an allowed origin, not account or bearer',async t=>{const c=await createConnector({port:0,autoExit:false,provider:{close:async()=>{}}});t.after(()=>c.close());const url=`http://127.0.0.1:${c.port}`;const post=(origin,route='presence')=>fetch(url+'/api/'+route,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:'{}'});const r=await post(url);assert.equal(r.status,200);assert.deepEqual(await r.json(),{app:'NodeCanvas',version:'1.12.0'});assert.equal((await post('https://unknown.test')).status,403);assert.equal((await post(url,'status')).status,401);});

test('only unmoved upload pointer release opens picker; a drag never does',()=>{assert.equal(uploadClick({kind:'node',upload:true,moved:false}),true);assert.equal(uploadClick({kind:'node',upload:true,moved:true}),false);assert.equal(uploadClick({kind:'node',upload:false,moved:false}),false);assert.equal(uploadClick({kind:'wire',upload:true,moved:false}),false);});

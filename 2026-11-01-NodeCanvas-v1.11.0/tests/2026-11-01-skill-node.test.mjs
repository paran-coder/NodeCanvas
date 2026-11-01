import test from 'node:test';
import assert from 'node:assert/strict';
import {canConnect,validateGraph,collectInputs,executionOrder,normalizeProject,editProject,projectJSON,restoreProject} from '../web/2026-10-31-graph.mjs';
import {HAIRLOCK,buildSkillPrompt} from '../web/2026-11-01-skills.mjs';
import {makeConnection,portsFor} from '../web/2026-10-31-canvas.mjs';
const skill=(id='hairlock')=>({id,type:'skill',x:40,y:400,data:{skill:HAIRLOCK.id,label:'HairLock'}});
test('skill ports are dedicated, edit-only, and accept a single source while allowing sharing',()=>{
 const p=editProject();p.nodes.push(skill(),skill('second'));
 assert.equal(canConnect(p.nodes[2],p.nodes[1],'skill'),true);assert.equal(canConnect(p.nodes[2],p.nodes[1],'image'),false);assert.equal(canConnect(p.nodes[0],p.nodes[1],'skill'),false);
 assert.equal(canConnect(p.nodes[2],{id:'g',type:'generate'},'skill'),false);
 p.edges.push(makeConnection(p,'hairlock','edit-start','skill-edge','skill'));
 assert.throws(()=>makeConnection(p,'second','edit-start','duplicate','skill'),/스킬/);
 p.nodes.push({...p.nodes[1],id:'other-edit'});p.edges.push(makeConnection(p,'hairlock','other-edit','shared','skill'));validateGraph(p);
 assert.ok(portsFor('edit').some(p=>p.kind==='skill'&&p.direction==='input'));assert.equal(portsFor('skill').length,1);
});
test('skill propagates as a distinct value, never as text/image, and disconnect removes it',()=>{
 const p=editProject();p.nodes.push(skill());p.edges.push({id:'s',from:'hairlock',to:'edit-start'});
 const values=collectInputs(p,'edit-start',{'image-start':{images:['reference']},hairlock:{skills:[HAIRLOCK.id]}});
 assert.equal(values.text,'');assert.deepEqual(values.images,['reference']);assert.deepEqual(values.skills,[HAIRLOCK.id]);
 assert.ok(buildSkillPrompt(p.nodes[1],'단발',values.images,values.skills).includes(HAIRLOCK.text));
 assert.ok(executionOrder(p,'edit-start').indexOf('hairlock')<executionOrder(p,'edit-start').indexOf('edit-start'));
 p.edges=p.edges.filter(e=>e.id!=='s');const none=collectInputs(p,'edit-start',{});assert.equal(buildSkillPrompt(p.nodes[1],'단발',['reference'],none.skills),'단발');
});
test('old inline HairLock becomes a real node without losing original request or backup fidelity',()=>{
 const p=editProject();p.nodes[1].data.skill=HAIRLOCK.id;const converted=normalizeProject(p);
 assert.equal(converted.nodes[1].data.skill,undefined);assert.equal(converted.nodes.filter(n=>n.type==='skill').length,1);assert.equal(converted.nodes[1].data.text,p.nodes[1].data.text);
 assert.equal(normalizeProject(converted).nodes.length,3);assert.deepEqual(restoreProject(projectJSON(converted)),converted);
 const s=converted.nodes.find(n=>n.type==='skill');assert.ok(converted.edges.some(e=>e.from===s.id&&e.to==='edit-start'));
});

import {nodeIcon,portIcon} from '../web/2026-11-01-icons.mjs';
test('small SVG icons distinguish all existing node kinds and skill ports without injecting names',()=>{const icons=['image','prompt','generate','edit','skill'].map(nodeIcon);assert.equal(new Set(icons).size,5);assert.ok(icons.every(s=>s.includes('width="16"')&&s.includes('aria-hidden="true"')));assert.equal(portIcon('skill'),nodeIcon('skill'));assert.ok(!nodeIcon('<script>').includes('<script>'));});
test('legacy conversion is collision safe and fails explicitly at node capacity without mutation',()=>{const p=editProject();p.nodes[1].data.skill=HAIRLOCK.id;p.nodes.push({id:'hairlock-edit-start',type:'prompt',x:0,y:0,data:{}});const converted=normalizeProject(p);validateGraph(converted);assert.notEqual(converted.nodes.find(n=>n.type==='skill').id,'hairlock-edit-start');while(p.nodes.length<150)p.nodes.push({id:'padding-'+p.nodes.length,type:'prompt',x:0,y:0,data:{}});assert.throws(()=>normalizeProject(p),/공간/);assert.equal(p.nodes.length,150);assert.equal(p.nodes[1].data.skill,HAIRLOCK.id);});

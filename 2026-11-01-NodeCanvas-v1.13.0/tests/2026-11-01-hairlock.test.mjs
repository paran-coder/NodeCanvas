import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {HAIRLOCK,buildSkillPrompt} from '../web/2026-11-01-skills.mjs';
import {editProject,normalizeProject,projectJSON,restoreProject,validateGraph} from '../web/2026-10-31-graph.mjs';
import {packProject,unpackProject} from '../web/2026-10-31-assets.mjs';
import {EditHistory} from '../web/2026-10-31-history.mjs';
function project(){const p=editProject();p.nodes.push({id:'s',type:'skill',x:0,y:400,data:{skill:HAIRLOCK.id}});p.edges.push({id:'se',from:'s',to:'edit-start'});return p;}
test('HairLock original text bytes remain unchanged',async()=>{const bytes=await readFile(new URL('../web/2026-11-01-hairlock.md',import.meta.url));assert.equal(createHash('sha256').update(bytes).digest('hex'),HAIRLOCK.sha256);assert.equal(bytes.toString('utf8'),HAIRLOCK.text);});
test('connected full instructions accompany edit and preconditions remain explicit',()=>{const n=editProject().nodes[1],s=[HAIRLOCK.id];const text=buildSkillPrompt(n,'단발로',['image'],s);assert.ok(text.includes(HAIRLOCK.text));assert.ok(text.endsWith('단발로'));assert.throws(()=>buildSkillPrompt(n,'단발',[],s),/원본 이미지/);assert.throws(()=>buildSkillPrompt(n,'',['image'],s),/지시/);assert.throws(()=>buildSkillPrompt(n,'x'.repeat(16000),['image'],s),/16,000/);assert.throws(()=>buildSkillPrompt(n,'단발',['image'],['unknown']),/지원/);});
test('skill graph backup and undo preserve actual node connections',()=>{const p=project(),h=new EditHistory();h.reset(p);p.edges=p.edges.filter(e=>e.id!=='se');h.record(p);assert.ok(h.undo().edges.some(e=>e.id==='se'));assert.ok(!h.redo().edges.some(e=>e.id==='se'));const restored=restoreProject(projectJSON(project()));assert.equal(restored.nodes.find(n=>n.type==='skill').data.skill,HAIRLOCK.id);validateGraph(restored);});
test('packed browser project retains skill node and edge while keeping source data immutable',async()=>{const p=project(),before=structuredClone(p),packed=await packProject(p);const restored=await unpackProject(packed.graph,new Map());assert.deepEqual(restored,normalizeProject(p));assert.deepEqual(p,before);});

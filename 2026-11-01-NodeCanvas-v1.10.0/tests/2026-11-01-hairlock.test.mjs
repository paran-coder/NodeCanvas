import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {HAIRLOCK,buildSkillPrompt,importHairLock,skillUploadApplies} from '../web/2026-11-01-skills.mjs';
import {editProject,normalizeProject,projectJSON,restoreProject,validateGraph} from '../web/2026-10-31-graph.mjs';
import {EditHistory} from '../web/2026-10-31-history.mjs';
test('HairLock source bytes match pinned original, and import never rewrites content',async()=>{
 const bytes=await readFile(new URL('../web/2026-11-01-hairlock.md',import.meta.url));
 assert.equal(createHash('sha256').update(bytes).digest('hex'),HAIRLOCK.sha256);
 const result=await importHairLock(bytes);assert.equal(result,HAIRLOCK.id);
 await assert.rejects(importHairLock(Buffer.from(bytes.toString('utf8')+'changed')),/원본/);
});
test('full unmodified instructions accompany user edit; image and length preconditions are explicit',()=>{
 const n=editProject().nodes.find(n=>n.type==='edit');n.data.skill=HAIRLOCK.id;
 const text=buildSkillPrompt(n,'앞머리 있는 단발로', ['image']);assert.ok(text.includes(HAIRLOCK.text));assert.ok(text.endsWith('앞머리 있는 단발로'));
 assert.throws(()=>buildSkillPrompt(n,'단발',[]),/원본 이미지/);
 assert.throws(()=>buildSkillPrompt(n,'', ['image']),/지시/);
 assert.throws(()=>buildSkillPrompt(n,'x'.repeat(16000),['image']),/16,000/);
 n.data.skill='unknown';assert.throws(()=>buildSkillPrompt(n,'단발',['image']),/지원/);
});
test('selection survives save, JSON and undo; invalid use is rejected',()=>{
 const p=editProject(),n=p.nodes.find(n=>n.type==='edit'),h=new EditHistory();h.reset(p);n.data.skill=HAIRLOCK.id;h.record(p);
 assert.equal(normalizeProject(p).nodes[1].data.skill,HAIRLOCK.id);assert.equal(restoreProject(projectJSON(p)).nodes[1].data.skill,HAIRLOCK.id);
 assert.equal(h.undo().nodes[1].data.skill,undefined);assert.equal(h.redo().nodes[1].data.skill,HAIRLOCK.id);
 n.type='generate';assert.throws(()=>validateGraph(p),/스킬/);
});
test('file selection cannot apply into another project or changed session',()=>{
 const p=editProject();assert.equal(skillUploadApplies({projectId:'a',session:1,nodeId:'edit-start'},{projectId:'a',session:1,project:p}),true);
 assert.equal(skillUploadApplies({projectId:'a',session:1,nodeId:'edit-start'},{projectId:'b',session:2,project:p}),false);
});

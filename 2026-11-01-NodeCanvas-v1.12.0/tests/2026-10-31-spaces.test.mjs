import test from 'node:test';
import assert from 'node:assert/strict';
import {makeSpace,copySpace,filterSpaces,updateSpace,settleEdits} from '../web/2026-10-31-spaces.mjs';
import {starterProject} from '../web/2026-10-31-graph.mjs';
import {nodeDragAllowed} from '../web/2026-10-31-canvas.mjs';
test('duplicate owns independent graph and preserves source',()=>{const a=makeSpace(starterProject(),'one',10);const b=copySpace(a,'two',20);b.project.nodes[0].data.text='changed';assert.notEqual(a.project.nodes[0].data.text,'changed');assert.equal(b.id,'two');assert.equal(a.updatedAt,10);});
test('search and trash are separate, latest project comes first',()=>{const a=makeSpace({...starterProject(),name:'숲 이미지'},'one',10),b=makeSpace({...starterProject(),name:'제품 사진'},'two',20);assert.deepEqual(filterSpaces([a,b],'',false).map(x=>x.id),['two','one']);assert.equal(filterSpaces([a,b],'숲',false)[0].id,'one');const trash=updateSpace(a,{trashed:true},30);assert.equal(filterSpaces([trash,b],'',false).length,1);assert.equal(filterSpaces([trash,b],'',true)[0].id,'one');assert.equal(updateSpace(trash,{trashed:false},40).trashed,false);});
test('image/body/header drag allowed; editing and port controls excluded',()=>{for(const tag of ['DIV','IMG','SPAN','ARTICLE'])assert.ok(nodeDragAllowed({tagName:tag,closest:()=>null}));for(const selector of ['input','textarea','select','button','[data-input]'])assert.equal(nodeDragAllowed({closest:()=>({matches:()=>true})}),false);});

test('project transition saves edits that arrive during a slow write',async()=>{let revision=1,saved=0,writes=[];await settleEdits(()=>saved!==revision,async()=>{const snapshot=revision;writes.push(snapshot);await Promise.resolve();if(snapshot===1)revision=2;saved=snapshot;});assert.deepEqual(writes,[1,2]);assert.equal(saved,revision);});

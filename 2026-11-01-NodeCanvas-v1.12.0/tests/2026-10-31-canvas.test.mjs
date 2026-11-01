import test from 'node:test';
import assert from 'node:assert/strict';
import {screenToWorld,curvePath,makeConnection,compatibleTypes,menuPosition,isImeKey} from '../web/2026-10-31-canvas.mjs';
const nodes=[{id:'a',type:'prompt',x:0,y:0,data:{}},{id:'b',type:'generate',x:400,y:0,data:{}},{id:'c',type:'edit',x:800,y:0,data:{}}];
const graph=()=>({version:'1.0.0',nodes:structuredClone(nodes),edges:[]});
test('drag drop uses inverse viewport transform at zoom and pan',()=>{
  assert.deepEqual(screenToWorld({x:510,y:350},{left:10,top:50},{x:100,y:50,scale:2}),{x:200,y:125});
});
test('preview curve reaches current pointer even when dragged backwards',()=>{
  const d=curvePath({x:400,y:60},{x:100,y:130});assert.match(d,/^M400,60 C/);assert.match(d,/100,130$/);
});
test('drop connection validates duplicates and cycles without mutating source',()=>{
  const g=graph();const edge=makeConnection(g,'a','b','new-edge');assert.equal(edge.from,'a');assert.equal(g.edges.length,0);
  g.edges.push(edge);assert.throws(()=>makeConnection(g,'a','b','duplicate'));
  g.edges.push({id:'bc',from:'b',to:'c'});assert.throws(()=>makeConnection(g,'c','b','cycle'),/순환/);
});
test('empty-canvas drop menu only offers compatible next nodes',()=>{
  assert.deepEqual(compatibleTypes({id:'a',type:'prompt'}),['generate','edit']);
  assert.deepEqual(compatibleTypes({id:'a',type:'generate'}),['generate','edit']);
});
test('context menu is clamped inside the viewport on narrow screens',()=>{
  assert.deepEqual(menuPosition({x:900,y:700},{width:1000,height:760},{width:310,height:400}),{x:678,y:348});
});
test('IME commit Enter and cancellation Escape are not treated as menu commands',()=>{
  assert.equal(isImeKey({isComposing:true,key:'Enter'}),true);
  assert.equal(isImeKey({keyCode:229,key:'Escape'}),true);
  assert.equal(isImeKey({isComposing:false,keyCode:13,key:'Enter'}),false);
});

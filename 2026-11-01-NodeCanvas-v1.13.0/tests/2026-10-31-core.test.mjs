import test from 'node:test';
import assert from 'node:assert/strict';
import { validateGraph, executionOrder, collectInputs, restoreProject } from '../web/2026-10-31-graph.mjs';
import { LeaseRegistry, allowedOrigin, validToken } from '../connector/2026-10-31-security.mjs';

const node = (id, type, data = {}) => ({ id, type, x: 0, y: 0, data });
const graph = () => ({ version: '1.0.0', name: '테스트', nodes: [node('p','prompt',{text:'soft light'}),node('g','generate'),node('r','edit')], edges: [{id:'a',from:'p',to:'g'},{id:'b',from:'g',to:'r'}] });
test('executes dependencies once, before shared downstream nodes', () => {
  const g = graph(); g.nodes.push(node('e','edit')); g.edges.push({id:'c',from:'g',to:'e'});
  assert.deepEqual(executionOrder(g), ['p','g','r','e']);
  assert.deepEqual(executionOrder(g, 'g'), ['p','g']);
});
test('rejects cycles before any generation', () => {
  const g = graph(); g.nodes.push(node('e','edit')); g.edges.push({id:'c',from:'g',to:'e'},{id:'d',from:'e',to:'g'});
  assert.throws(() => validateGraph(g), /순환/);
});
test('rejects missing nodes, duplicate ids and incompatible ports', () => {
  const g = graph(); g.edges[0].to = 'missing'; assert.throws(() => validateGraph(g));
  const h = graph(); h.nodes.push(node('p','prompt')); assert.throws(() => validateGraph(h));
  const j = graph(); j.edges.push({id:'c',from:'g',to:'p'}); assert.throws(() => validateGraph(j));
});
test('collects prompt text and image data without mixing image into text', () => {
  const g=graph(); g.nodes.push(node('i','image')); g.edges.push({id:'c',from:'i',to:'g'});
  const input=collectInputs(g,'g',{p:{text:'soft light'},i:{images:['data:image/png;base64,aGVsbG8=']}});
  assert.deepEqual(input,{text:'soft light',images:['data:image/png;base64,aGVsbG8=']});
});
test('restores only validated project data and rejects external image URLs', () => {
  const g=graph(); const restored=restoreProject(JSON.stringify(g)); assert.equal(restored.nodes.length,3);
  g.nodes.push(node('i','image',{image:'https://evil.test/track.png'}));
  assert.throws(() => restoreProject(JSON.stringify(g)), /이미지/);
  assert.throws(() => restoreProject('{"version":"9"}'));
});
test('multiple tabs keep connector alive and last tab expires after grace', () => {
  const leases=new LeaseRegistry({now:0,grace:90,startup:300});
  assert.equal(leases.expired(299),false);
  leases.touch('one',20); leases.touch('two',70);
  assert.equal(leases.expired(111),false);
  assert.equal(leases.expired(161),true);
});
test('origin allowlist is exact and token comparison rejects missing credentials', () => {
  const origins=new Set(['https://canvas.vercel.app']);
  assert.equal(allowedOrigin('https://canvas.vercel.app',origins),true);
  for(const origin of [undefined,'null','https://canvas.vercel.app.evil.test','https://evil.test']) assert.equal(allowedOrigin(origin,origins),false);
  assert.equal(validToken('Bearer abc','abc'),true);
  assert.equal(validToken('Bearer ab','abc'),false);
  assert.equal(validToken(undefined,'abc'),false);
});
test('an open stream keeps a background tab alive without JavaScript heartbeats',()=>{
  const leases=new LeaseRegistry({now:0,grace:90,startup:300});
  leases.open('background',10);assert.equal(leases.expired(2000),false);
  leases.close('background',2000);assert.equal(leases.expired(2089),false);assert.equal(leases.expired(2090),true);
});

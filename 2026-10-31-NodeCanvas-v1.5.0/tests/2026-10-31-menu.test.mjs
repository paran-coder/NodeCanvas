import test from 'node:test';
import assert from 'node:assert/strict';
import {filterCatalog,requiresMedia} from '../web/2026-10-31-catalog.mjs';
test('Korean image category includes upload and supported generators only',()=>{
  assert.deepEqual(filterCatalog({category:'image'}),['image','generate','edit']);
});
test('search and compatibility filters intersect without exposing other node types',()=>{
  assert.deepEqual(filterCatalog({query:'이미지',category:'all',allowed:['generate','edit','result']}),['generate','edit','result']);
  assert.deepEqual(filterCatalog({query:'텍스트',category:'image'}),[]);
  assert.deepEqual(filterCatalog({category:'text'}),['prompt']);
});
test('media layout is reserved for actual image-producing node kinds',()=>{
  assert.equal(requiresMedia('generate'),true);assert.equal(requiresMedia('prompt'),false);
});

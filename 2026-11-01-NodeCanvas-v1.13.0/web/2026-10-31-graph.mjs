import {MAX_SCENE_LENGTH} from './2026-11-10-scene-planning.mjs';
import {cleanMentions} from './2026-11-03-image-mentions.mjs';
import {colorSettings} from './2026-11-03-color.mjs';
import {cleanNodeCounters} from './2026-11-01-node-numbers.mjs';
import {HAIRLOCK,validateNodeSkill,getSkill} from './2026-11-01-skills.mjs';
export const MAX_PROJECT_BYTES=200_000_000;
export const MAX_NODE_COUNT=150,MAX_EDGE_COUNT=500;
const utf8=value=>new TextEncoder().encode(value).byteLength;
function cleanData(n){return {...(n.type==='generate'?{count:Number.isInteger(n.data.count)&&n.data.count>=1&&n.data.count<=10?n.data.count:1,mode:n.data.mode==='parallel'?'parallel':'serial',...(typeof n.data.scene==='string'&&n.data.scene?{scene:n.data.scene.trim().slice(0,MAX_SCENE_LENGTH)}:{})}:{}),...(n.data.mentions?.length?{mentions:cleanMentions(n.data.mentions,n.data.text||'')}:{}) ,...(n.type==='color'?{color:colorSettings(n.data.color)}:{}),...(n.data.sequence!==undefined?{sequence:n.data.sequence}:{}),...(n.data.skill?{skill:n.data.skill}:{}),text:n.data.text||'',image:n.data.image||'',ratio:['1:1','3:2','2:3','16:9','9:16'].includes(n.data.ratio)?n.data.ratio:'1:1',label:String(n.type==='image'&&['참조 이미지','업로드하기'].includes(n.data.label)?'이미지 업로드':n.data.label||'').slice(0,80)};}
export function projectBytes(graph){let images=0;const nodes=graph.nodes.map(n=>{const data=cleanData(n);images+=data.image.length;data.image='';return {id:n.id,type:n.type,x:n.x,y:n.y,data};});return utf8(JSON.stringify({version:'1.0.0',name:String(graph.name||'이름 없는 워크플로').slice(0,80),...(graph.nodeCounters?{nodeCounters:cleanNodeCounters(graph.nodeCounters)}:{}),nodes,edges:graph.edges.map(e=>({id:e.id,from:e.from,to:e.to}))}))+images;}
export const TYPES = {
  skill: {label:'스킬',icon:'🧩',color:'#f4d4a0',output:'skill'},
  prompt: { label:'프롬프트', icon:'T', color:'#c5dd83', output:'text' },
  image: { label:'이미지 업로드', icon:'▧', color:'#c7b0f5', output:'image' },
  generate: { label:'이미지 생성', icon:'✦', color:'#c5dd83', output:'image' },
  color: {label:'색감 조정',icon:'◐',color:'#c3faf5'},
  edit: { label:'이미지 편집', icon:'◈', color:'#e9ba88', output:'image' },
};
export function isImage(value) {
  return typeof value==='string' && value.length<=28_000_000 && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value);
}
export function outputKind(type){return TYPES[type]?.output==='text'?'prompt':TYPES[type]?.output;}
export function canConnect(source,target,inputKind=null){
 if(!source||!target||!Object.hasOwn(TYPES,source.type)||!Object.hasOwn(TYPES,target.type)||source.id===target.id||source.type==='color')return false;
 if(target.type==='color')return ['generate','edit'].includes(source.type)&&(!inputKind||inputKind==='image');
 if(!['generate','edit'].includes(target.type))return false;
 if(source.type==='skill'&&getSkill(source.data?.skill)?.mode==='generate'&&target.type!=='generate')return false;
 const kind=outputKind(source.type);if(inputKind&&kind!==inputKind)return false;
 return true;
}
export function validateGraph(graph,{checkSize=true}={}) {
  if(!graph || graph.version!=='1.0.0' || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) throw new Error('지원하지 않는 프로젝트 형식입니다.');
  if(graph.nodes.length>MAX_NODE_COUNT || graph.edges.length>MAX_EDGE_COUNT) throw new Error('노드는 150개, 연결은 500개까지 지원합니다.');
  if(graph.nodeCounters!==undefined)cleanNodeCounters(graph.nodeCounters);
  const nodes=new Map();
  for(const n of graph.nodes) {
    if(n?.type==='result')throw new Error('이 버전은 결과 노드를 지원하지 않습니다. 생성·편집 카드에서 이미지를 확인하고 저장하세요.');
    if(!n || typeof n.id!=='string' || !/^[\w-]{1,80}$/.test(n.id) || nodes.has(n.id) || !Object.hasOwn(TYPES,n.type)) throw new Error('잘못되거나 중복된 노드입니다.');
    if(!Number.isFinite(n.x) || !Number.isFinite(n.y) || Math.abs(n.x)>100000 || Math.abs(n.y)>100000) throw new Error('노드 위치가 올바르지 않습니다.');
    if(!n.data || typeof n.data!=='object' || Array.isArray(n.data)) throw new Error('노드 내용이 올바르지 않습니다.');
    if(n.data.sequence!==undefined&&(!Number.isSafeInteger(n.data.sequence)||n.data.sequence<1||n.data.sequence>1_000_000_000))throw new Error('노드 번호가 올바르지 않습니다.');
    validateNodeSkill(n);
    if(n.data.count!==undefined&&(!Number.isInteger(n.data.count)||n.data.count<1||n.data.count>10))throw Error('이미지 장수는 1~10장이어야 합니다.');
    if(n.data.text!==undefined && (typeof n.data.text!=='string' || n.data.text.length>16000)) throw new Error('프롬프트는 16,000자까지 입력할 수 있습니다.');
    if(n.data.image && !isImage(n.data.image)) throw new Error('이미지는 PNG/JPEG/WebP 파일만 사용할 수 있습니다.');
    nodes.set(n.id,n);
  }
  const ids=new Set(), pairs=new Set(),skillTargets=new Set(),colorTargets=new Set();
  for(const e of graph.edges) {
    const pair=`${e.from}:${e.to}`;
    if(typeof e.id!=='string' || !/^[\w-]{1,80}$/.test(e.id) || ids.has(e.id) || pairs.has(pair) || !canConnect(nodes.get(e.from),nodes.get(e.to))) throw new Error('연결할 수 없는 노드 조합입니다.');
    if(nodes.get(e.from).type==='skill'){if(skillTargets.has(e.to)||nodes.get(e.to).data.skill)throw new Error('생성·편집 노드에는 스킬 하나만 연결할 수 있습니다.');skillTargets.add(e.to);}
    if(nodes.get(e.to).type==='color'){
      if(colorTargets.has(e.to))throw new Error('색감 조정에는 이미지 생성기 또는 편집기 한 개만 연결할 수 있습니다.');
      colorTargets.add(e.to);
    }
    ids.add(e.id); pairs.add(pair);
  }
  const visiting=new Set(), visited=new Set();
  function visit(id) {
    if(visiting.has(id)) throw new Error('순환 연결은 사용할 수 없습니다.');
    if(visited.has(id)) return;
    visiting.add(id);
    for(const e of graph.edges.filter(e=>e.to===id)) visit(e.from);
    visiting.delete(id); visited.add(id);
  }
  graph.nodes.forEach(n=>visit(n.id));
  if(checkSize&&projectBytes(graph)>MAX_PROJECT_BYTES)throw new Error('프로젝트 용량은 200MB까지 지원합니다. 이미지를 저장한 뒤 불필요한 노드를 줄여 주세요.');
  return graph;
}
export function executionOrder(graph, target) {
  validateGraph(graph);
  if(target && !graph.nodes.some(n=>n.id===target)) throw new Error('선택한 노드가 없습니다.');
  const order=[], visited=new Set();
  function visit(id) {
    if(visited.has(id)) return;
    for(const edge of graph.edges.filter(e=>e.to===id)) visit(edge.from);
    visited.add(id); order.push(id);
  }
  (target?[{id:target}]:graph.nodes).forEach(n=>visit(n.id));
  return order;
}
export function collectInputs(graph, id, outputs) {
  const values=graph.edges.filter(e=>e.to===id).map(e=>outputs[e.from]).filter(Boolean);
  const skills=values.flatMap(v=>v.skills||[]);
  return {...(skills.length?{skills}:{}),text:values.map(v=>v.text).filter(Boolean).join('\n\n'),images:[...new Set(values.flatMap(v=>v.images||[]))]};
}
export function normalizeProject(data,{allowOversized=false}={}) {
 validateGraph(data,{checkSize:!allowOversized});
 const graph={version:'1.0.0',name:String(data.name||'이름 없는 워크플로').slice(0,80),...(data.nodeCounters?{nodeCounters:cleanNodeCounters(data.nodeCounters)}:{}),nodes:data.nodes.map(n=>({id:n.id,type:n.type,x:n.x,y:n.y,data:cleanData(n)})),edges:data.edges.map(e=>({id:e.id,from:e.from,to:e.to}))};
 for(const node of [...graph.nodes])if(node.type==='edit'&&node.data.skill){
  if(graph.nodes.length>=MAX_NODE_COUNT||graph.edges.length>=MAX_EDGE_COUNT)throw new Error('기존 스킬을 노드로 변환할 공간이 없습니다. 이전 버전에서 노드나 연결을 줄인 뒤 다시 열어 주세요.');
  const unique=(base,items)=>{let id=base,count=0;while(items.some(item=>item.id===id))id=base+'-'+(++count);return id;};
  const id=unique('hairlock-'+node.id.slice(0,50),graph.nodes),edgeId=unique('skill-link-'+node.id.slice(0,50),graph.edges);
  graph.nodes.push({id,type:'skill',x:Math.max(-100000,node.x-380),y:Math.min(100000,node.y+300),data:cleanData({type:'skill',data:{skill:node.data.skill,label:getSkill(node.data.skill)?.name||'스킬'}})});
  graph.edges.push({id:edgeId,from:id,to:node.id});delete node.data.skill;
 }
 validateGraph(graph,{checkSize:!allowOversized});return graph;
}
export function restoreProject(input) {
 if(typeof input!=='string'||input.length>MAX_PROJECT_BYTES||utf8(input)>MAX_PROJECT_BYTES)throw new Error('프로젝트 JSON은 200MB까지 열 수 있습니다.');
 return normalizeProject(JSON.parse(input));
}
export function projectJSON(project){return JSON.stringify(normalizeProject(project));}
export function starterProject(){
 return {version:'1.0.0',name:'첫 번째 이미지 워크플로',nodes:[
  {id:'generate-start',type:'generate',x:120,y:120,data:{text:'고요한 아침, 안개가 살짝 낀 숲속의 작은 유리 온실. 부드러운 자연광과 차분한 초록색, 섬세한 필름 사진. 글자나 로고 없이.',ratio:'3:2',label:'첫 번째 이미지'}}
 ],edges:[]};
}
export function editProject(){
 return {version:'1.0.0',name:'이미지 편집하기',nodes:[
  {id:'image-start',type:'image',x:64,y:120,data:{label:'이미지 업로드'}},
  {id:'edit-start',type:'edit',x:730,y:120,data:{text:'주요 피사체와 구도를 유지하고, 빛을 따뜻한 노을빛으로 바꿔 주세요.',ratio:'3:2',label:'이미지 편집'}}
 ],edges:[{id:'edge-image-edit',from:'image-start',to:'edit-start'}]};
}

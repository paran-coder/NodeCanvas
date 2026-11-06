import {TYPES,outputKind,canConnect,validateGraph} from './2026-10-31-graph.mjs';
export const NODE_WIDTH=380, IMAGE_NODE_WIDTH=550, PORT_Y=160;
export function nodeWidth(type){return ['image','generate','edit'].includes(type)?IMAGE_NODE_WIDTH:NODE_WIDTH;}
export function isImeKey(event){return event.isComposing===true||event.keyCode===229;}
export function screenToWorld(point,rect,view){return {x:(point.x-rect.left-view.x)/view.scale,y:(point.y-rect.top-view.y)/view.scale};}
export function curvePath(from,to){const bend=Math.max(70,Math.abs(to.x-from.x)*.5);return `M${from.x},${from.y} C${from.x+bend},${from.y} ${to.x-bend},${to.y} ${to.x},${to.y}`;}
export function makeConnection(graph,from,to,id,inputKind=null){
  if(!canConnect(graph.nodes.find(n=>n.id===from),graph.nodes.find(n=>n.id===to),inputKind))throw new Error('이 입력 포트에는 연결할 수 없습니다. 텍스트·이미지·스킬을 각각 맞는 입력 아이콘에 연결하세요.');
  const edge={id,from,to};validateGraph({...graph,edges:[...graph.edges,edge]});return edge;
}
export function compatibleTypes(source){return Object.keys(TYPES).filter(type=>canConnect(source,{id:'new-node',type}));}
export function menuPosition(point,viewport,size){return {x:Math.max(12,Math.min(point.x,viewport.width-size.width-12)),y:Math.max(12,Math.min(point.y,viewport.height-size.height-12))};}

export function nodeDragAllowed(target){const control=target.closest('input,textarea,select,button,a,[contenteditable="true"],[data-input],[data-output],[data-edge]');return !control||control.hasAttribute?.('data-upload-surface')===true;}

export function uploadClick(finished){return finished?.kind==='node'&&finished.upload===true&&!finished.moved;}

export function portOffset(type,direction,kind){if(type==='skill')return 39;if(direction==='input'&&['generate','edit'].includes(type))return kind==='prompt'?110:kind==='skill'?190:150;return PORT_Y;}
export function portsFor(type){
 if(!Object.hasOwn(TYPES,type))return [];
 if(type==='color')return [{direction:'input',kind:'image',label:'원본 이미지',description:'이미지 생성기 또는 편집기의 출력을 연결하세요.'}];
 const input=['generate','edit'].includes(type)?[
 {direction:'input',kind:'prompt',icon:'T',label:'프롬프트',description:'텍스트 연결은 선택 사항입니다. 카드 안에 직접 입력해도 됩니다.'},
 {direction:'input',kind:'image',icon:'▧',label:'참조 이미지',description:type==='edit'?'편집할 이미지를 연결하세요. 최소 한 장 필요합니다.':'참고할 이미지를 연결하세요. HairLock을 사용할 때는 원본 이미지가 필수입니다.'}
 ]:[];
 if(['generate','edit'].includes(type))input.push({direction:'input',kind:'skill',icon:'🧩',label:'스킬',description:'선택한 스킬 노드를 연결하면 적용됩니다. 연결을 끊으면 해제됩니다. 한 개만 연결할 수 있습니다.'});
 const kind=outputKind(type);return [...input,{direction:'output',kind,icon:kind==='prompt'?'T':kind==='skill'?'🧩':'▧',label:kind==='prompt'?'텍스트':kind==='skill'?'스킬':type==='generate'?'생성 이미지':type==='edit'?'편집 이미지':'이미지',description:kind==='skill'?'다음 이미지 생성·편집 노드의 스킬 입력에 연결하세요.':kind==='prompt'?'다음 노드의 프롬프트 입력에 연결하세요.':'다음 노드의 이미지 입력에 연결하세요.'}];
}

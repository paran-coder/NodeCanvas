import {TYPES,canConnect,validateGraph} from './2026-10-31-graph.mjs';
export const NODE_WIDTH=320, PORT_Y=160;
export function isImeKey(event){return event.isComposing===true||event.keyCode===229;}
export function screenToWorld(point,rect,view){return {x:(point.x-rect.left-view.x)/view.scale,y:(point.y-rect.top-view.y)/view.scale};}
export function curvePath(from,to){const bend=Math.max(70,Math.abs(to.x-from.x)*.5);return `M${from.x},${from.y} C${from.x+bend},${from.y} ${to.x-bend},${to.y} ${to.x},${to.y}`;}
export function makeConnection(graph,from,to,id,inputKind=null){
  if(!canConnect(graph.nodes.find(n=>n.id===from),graph.nodes.find(n=>n.id===to),inputKind))throw new Error('이 입력 포트에는 연결할 수 없습니다. T에는 텍스트, 이미지 아이콘에는 이미지를 연결하세요.');
  const edge={id,from,to};validateGraph({...graph,edges:[...graph.edges,edge]});return edge;
}
export function compatibleTypes(source){return Object.keys(TYPES).filter(type=>canConnect(source,{id:'new-node',type}));}
export function menuPosition(point,viewport,size){return {x:Math.max(12,Math.min(point.x,viewport.width-size.width-12)),y:Math.max(12,Math.min(point.y,viewport.height-size.height-12))};}

export function nodeDragAllowed(target){const control=target.closest('input,textarea,select,button,a,[contenteditable="true"],[data-input],[data-output],[data-edge]');return !control||control.hasAttribute?.('data-upload-surface')===true;}

export function uploadClick(finished){return finished?.kind==='node'&&finished.upload===true&&!finished.moved;}

export function portOffset(type,direction,kind){return direction==='input'&&['generate','edit'].includes(type)?kind==='prompt'?120:172:PORT_Y;}
export function portsFor(type){
 const input=['generate','edit'].includes(type)?[
  {direction:'input',kind:'prompt',icon:'T',label:'프롬프트',description:'텍스트 노드의 지시문을 연결하세요.'},
  {direction:'input',kind:'image',icon:'▧',label:'참조 이미지',description:type==='edit'?'편집할 이미지를 연결하세요. 최소 한 장 필요합니다.':'참고할 이미지를 연결하세요. 선택 사항입니다.'}
 ]:type==='result'?[{direction:'input',kind:'image',icon:'▧',label:'이미지',description:'연결된 최신 이미지를 자동으로 보여줍니다. AI 실행은 없습니다.'}]:[];
 const text=type==='prompt';return [...input,{direction:'output',kind:text?'prompt':'image',icon:text?'T':'▧',label:text?'텍스트':type==='generate'?'생성 이미지':type==='edit'?'편집 이미지':type==='result'?'미리보기 이미지':'이미지',description:text?'다음 노드의 T 프롬프트 입력에 연결하세요.':'다음 노드의 이미지 입력에 연결하세요.'}];
}

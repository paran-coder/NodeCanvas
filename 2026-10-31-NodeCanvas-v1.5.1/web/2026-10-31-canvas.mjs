import {TYPES,canConnect,validateGraph} from './2026-10-31-graph.mjs';
export const NODE_WIDTH=320, PORT_Y=160;
export function isImeKey(event){return event.isComposing===true||event.keyCode===229;}
export function screenToWorld(point,rect,view){return {x:(point.x-rect.left-view.x)/view.scale,y:(point.y-rect.top-view.y)/view.scale};}
export function curvePath(from,to){const bend=Math.max(70,Math.abs(to.x-from.x)*.5);return `M${from.x},${from.y} C${from.x+bend},${from.y} ${to.x-bend},${to.y} ${to.x},${to.y}`;}
export function makeConnection(graph,from,to,id){
  const edge={id,from,to};validateGraph({...graph,edges:[...graph.edges,edge]});return edge;
}
export function compatibleTypes(source){return Object.keys(TYPES).filter(type=>canConnect(source,{id:'new-node',type}));}
export function menuPosition(point,viewport,size){return {x:Math.max(12,Math.min(point.x,viewport.width-size.width-12)),y:Math.max(12,Math.min(point.y,viewport.height-size.height-12))};}

export function nodeDragAllowed(target){const control=target.closest('input,textarea,select,button,a,[contenteditable="true"],[data-input],[data-output],[data-edge]');return !control||control.hasAttribute?.('data-upload-surface')===true;}

export function uploadClick(finished){return finished?.kind==='node'&&finished.upload===true&&!finished.moved;}

import {validateGraph,MAX_NODE_COUNT} from './2026-10-31-graph.mjs';
import {assignNodeNumber,ensureNodeNumbers} from './2026-11-01-node-numbers.mjs';
import {cleanMentions,moveMentions} from './2026-11-03-image-mentions.mjs';
import {nodeWidth} from './2026-10-31-canvas.mjs';

function nodeHeight(node,heights){
  if(heights[node.id])return heights[node.id];
  if(['generate','edit','image'].includes(node.type)){
    const [w,h]=(node.data.ratio||'1:1').split(':').map(Number);
    return (nodeWidth(node.type)-2)*h/w+2;
  }
  return node.type==='skill'?150:280;
}

export function createGenerationBatch(project,target,count,{id=()=>crypto.randomUUID(),heights={}}={}){
  if(!Number.isInteger(count)||count<1||count>10)throw Error('한 번에 1~10장을 선택하세요.');
  const graph=structuredClone(project),source=graph.nodes.find(node=>node.id===target);
  if(!source||source.type!=='generate')throw Error('이미지 생성 노드에서 장수를 선택하세요.');
  if(graph.nodes.length+count-1>MAX_NODE_COUNT)throw Error('노드는 150개까지 추가할 수 있습니다.');
  ensureNodeNumbers(graph);
  const targets=[target],inputs=graph.edges.filter(edge=>edge.to===target);
  const [rw,rh]=(source.data.ratio||'1:1').split(':').map(Number);
  const height=(nodeWidth(source.type)-2)*rh/rw+2;
  const stepY=Math.max(height,nodeHeight(source,heights))+80,stepX=nodeWidth(source.type)+60;
  for(let index=1;index<count;index++){
    let location=null;
    for(let slot=1;slot<600;slot++){
      const x=source.x+(slot%2)*stepX*(source.x>99000?-1:1);
      const y=source.y+Math.floor(slot/2)*stepY*(source.y>99000?-1:1);
      if(Math.abs(x)>100000||Math.abs(y)>100000)continue;
      const clear=graph.nodes.every(other=>x+nodeWidth(source.type)+30<=other.x||other.x+nodeWidth(other.type)+30<=x||
        y+height+50<=other.y||other.y+nodeHeight(other,heights)+50<=y);
      if(clear){location={x:Math.round(x),y:Math.round(y)};break;}
    }
    if(!location)throw Error('새 이미지 노드를 놓을 공간을 확보하세요.');
    const data={...structuredClone(source.data),image:'',count:1,mode:'serial',label:(source.data.label||'이미지 생성').slice(0,75)+' ('+(index+1)+')'};
    delete data.sequence;
    const clone={id:id(),type:'generate',...location,data};
    assignNodeNumber(graph,clone);
    graph.nodes.push(clone);
    targets.push(clone.id);
    for(const edge of inputs)graph.edges.push({id:id(),from:edge.from,to:clone.id});
  }
  validateGraph(graph);
  return {graph,targets};
}

export function removeReference(node,sourceId){
  let text=node.data.text||'',mentions=cleanMentions(node.data.mentions,text);
  const removed=mentions.filter(item=>item.sourceId===sourceId).reverse();
  for(const item of removed){
    const before=text;
    text=text.slice(0,item.start)+text.slice(item.start+item.token.length);
    mentions=moveMentions(mentions,before,text);
  }
  return {text,mentions};
}

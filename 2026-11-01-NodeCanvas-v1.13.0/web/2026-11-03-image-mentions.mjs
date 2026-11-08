import {TYPES,isImage} from './2026-10-31-graph.mjs';

export function cleanMentions(value,text=''){
  if(!Array.isArray(value))return [];
  let end=0;
  return value.slice(0,256).filter(item=>{
    if(!item||!Number.isInteger(item.start)||item.start<end||
       typeof item.token!=='string'||!/^@[^\r\n]{1,80}$/.test(item.token)||
       typeof item.sourceId!=='string'||!/^[-\w]{1,80}$/.test(item.sourceId)||
       text.slice(item.start,item.start+item.token.length)!==item.token)return false;
    end=item.start+item.token.length;
    return true;
  }).map(({start,token,sourceId})=>({start,token,sourceId}));
}

export function moveMentions(value,before,after){
  let start=0,tail=0;
  while(start<Math.min(before.length,after.length)&&before[start]===after[start])start++;
  while(tail<Math.min(before.length,after.length)-start&&before.at(-1-tail)===after.at(-1-tail))tail++;
  return cleanMentions(value,before).flatMap(item=>{
    if(item.start+item.token.length<=start)return [item];
    if(item.start>=before.length-tail)return [{...item,start:item.start+after.length-before.length}];
    return [];
  });
}

export function bindMentionPrompt(request,node,graph,outputs){
  const mentions=cleanMentions(node.data.mentions,node.data.text);
  if(!mentions.length)return request;
  const refs=new Map();
  const bindings=mentions.map(({token,sourceId})=>{
    const image=outputs[sourceId]?.images?.[0];
    const index=request.images.indexOf(image);
    if(!graph.edges.some(edge=>edge.from===sourceId&&edge.to===node.id)||index<0){
      throw new Error(token+' 참조 이미지 연결이나 결과를 확인하세요.');
    }
    if(refs.has(token)&&refs.get(token)!==index)throw new Error(token+' 참조가 중복됩니다. 노드 이름을 구분해 주세요.');
    refs.set(token,index);
    return [token,index+1];
  });
  const lines=[...new Set(bindings.map(([token,index])=>JSON.stringify(token)+' = 이미지 '+index))];
  return {...request,prompt:request.prompt+'\n\n이미지 참조 대응 (첨부 순서):\n'+lines.join('\n')};
}

export function mentionTitle(node){
  return (node.data.label||'').trim()||TYPES[node.type].label;
}

export function mentionCandidates(graph,target,query){
  const match=query.toLowerCase();
  return graph.nodes.filter(source=>source.id!==target.id&&TYPES[source.type]?.output==='image'&&
    isImage(source.data.image)&&mentionTitle(source).toLowerCase().includes(match));
}

export function exactMention(candidates,query){
  const exact=candidates.filter(source=>mentionTitle(source).toLowerCase()===query.toLowerCase());
  return exact.length===1?exact[0]:null;
}

export function mentionMenuPlacement(rect,viewport,count){
  const margin=8,gap=6;
  const width=Math.min(220,viewport.width-margin*2);
  const wanted=Math.min(6,count)*28+10;
  const below=viewport.height-margin-rect.bottom-gap;
  const above=rect.top-margin-gap;
  const left=Math.max(margin,Math.min(rect.left,viewport.width-margin-width));
  if(Math.max(below,above)>=Math.min(wanted,66)){
    const down=below>=wanted||below>=above;
    const height=Math.min(wanted,down?below:above);
    return {left,top:down?rect.bottom+gap:rect.top-gap-height,width,height};
  }
  const right=viewport.width-margin-rect.right-gap;
  const before=rect.left-margin-gap;
  if(Math.max(right,before)>=width){
    const height=Math.min(wanted,viewport.height-margin*2);
    return {left:right>=width?rect.right+gap:rect.left-gap-width,
      top:Math.max(margin,Math.min(rect.top,viewport.height-margin-height)),width,height};
  }
  const down=below>=above;
  const height=Math.max(0,Math.min(wanted,down?below:above));
  return {left,top:down?rect.bottom+gap:Math.max(margin,rect.top-gap-height),width,height};
}

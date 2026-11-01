import {executionOrder,isImage} from './2026-10-31-graph.mjs';
import {buildSkillPrompt,getSkill} from './2026-11-01-skills.mjs';
export function executionPlan(graph,target){
 executionOrder(graph,target);const order=[],visited=new Set(),reused=new Set();
 function visit(id){if(visited.has(id))return;visited.add(id);const node=graph.nodes.find(n=>n.id===id);
  if(target&&id!==target&&['generate','edit'].includes(node.type)&&isImage(node.data.image)){reused.add(id);order.push(id);return;}
  for(const edge of graph.edges.filter(e=>e.to===id))visit(edge.from);order.push(id);
 }
 (target?[target]:graph.nodes.map(n=>n.id)).forEach(visit);return {order,reused};
}
export function requestForNode(node,inputs){
 const images=inputs.images||[],skills=inputs.skills||[];
 const userPrompt=[inputs.text,node.data.text].filter(Boolean).join('\n\n');
 const prompt=buildSkillPrompt(node,userPrompt,images,skills);
 if(!prompt.trim())throw new Error('프롬프트를 연결하거나 추가 지시사항을 입력하세요.');
 const selected=getSkill(skills[0]);
 return {prompt,images,kind:selected?.mode||(node.type==='edit'?'edit':'generate'),ratio:selected?.ratio||node.data.ratio||'1:1'};
}

const snapshot=g=>({...g,...(g.nodeCounters?{nodeCounters:{...g.nodeCounters}}:{}),nodes:g.nodes.map(n=>({...n,data:{...n.data}})),edges:g.edges.map(e=>({...e}))});
function same(a,b){return a?.name===b.name&&JSON.stringify(a.nodeCounters||{})===JSON.stringify(b.nodeCounters||{})&&a.nodes.length===b.nodes.length&&a.edges.length===b.edges.length&&a.nodes.every((n,i)=>{const m=b.nodes[i];return n.id===m.id&&n.type===m.type&&n.x===m.x&&n.y===m.y&&['text','image','ratio','label','skill','sequence','count','mode','scene'].every(k=>(n.data[k]??'')===(m.data[k]??''))&&JSON.stringify(n.data.mentions||[])===JSON.stringify(m.data.mentions||[]);})&&a.edges.every((e,i)=>e.id===b.edges[i].id&&e.from===b.edges[i].from&&e.to===b.edges[i].to);}
export class EditHistory {
 constructor({maxSteps=40,maxExtraImageBytes=64_000_000}={}){this.maxSteps=maxSteps;this.maxExtraImageBytes=maxExtraImageBytes;this.states=[];this.index=-1;this.group=null;this.time=0;}
 reset(project){this.states=[snapshot(project)];this.index=0;this.group=null;this.time=0;}
 get canUndo(){return this.index>0;}get canRedo(){return this.index<this.states.length-1;}
 record(project,group=null,now=Date.now()){
  if(this.index<0){this.reset(project);return;}
  if(same(this.states[this.index],project))return;
  this.states.length=this.index+1;
  if(group&&group===this.group&&now-this.time<750&&this.index>0)this.states[this.index]=snapshot(project);
  else{this.states.push(snapshot(project));this.index++;}
  this.group=group;this.time=now;
  const current=new Set(project.nodes.map(n=>n.data.image).filter(Boolean));
  while(this.states.length>1){const extra=new Set(this.states.flatMap(g=>g.nodes.map(n=>n.data.image).filter(i=>i&&!current.has(i))));const bytes=[...extra].reduce((n,i)=>n+i.length*2,0);if(this.states.length<=this.maxSteps+1&&bytes<=this.maxExtraImageBytes)break;this.states.shift();this.index--;}
 }
 undo(){if(!this.canUndo)return null;this.group=null;return snapshot(this.states[--this.index]);}
 redo(){if(!this.canRedo)return null;this.group=null;return snapshot(this.states[++this.index]);}
}

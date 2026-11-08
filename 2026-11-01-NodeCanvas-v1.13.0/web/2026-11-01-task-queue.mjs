// One connector job at a time. All task ownership is explicit and independent of the visible project.
export class TaskQueue {
  constructor({execute,cancel=async()=>{},onChange=()=>{},limit=8}){Object.assign(this,{execute,cancelRun:cancel,onChange,limit,items:[],active:null,scheduled:false,waiters:[]});}
  get pending(){return this.items.filter(t=>['queued','running','cancelling'].includes(t.state));}
  hasProject(id){return this.pending.some(t=>t.projectId===id);}
  locked(projectId,nodeId){return this.pending.some(t=>t.projectId===projectId&&t.nodeIds.includes(nodeId));}
  emit(task){this.onChange(task);}
  checkMany(tasks){
    if(!Array.isArray(tasks)||!tasks.length)throw Error('등록할 작업이 없습니다.');
    if(this.pending.length+tasks.length>this.limit)throw Error('작업은 실행 중인 작업을 포함해 '+this.limit+'개까지 등록할 수 있습니다.');
    const reserved=[...this.pending],ids=new Set(this.items.map(task=>task.id));
    for(const task of tasks){
      if(ids.has(task.id))throw Error('이미 등록된 작업입니다.');
      const writes=task.writeIds||task.nodeIds;
      if(reserved.some(other=>other.projectId===task.projectId&&
        ((other.writeIds||other.nodeIds).some(id=>task.nodeIds.includes(id))||writes.some(id=>other.nodeIds.includes(id))))){
        throw Error('실행·대기 중이거나 여러 요청이 함께 생성해야 하는 참조 노드가 있습니다. 참조 이미지 생성을 마친 뒤 다시 실행하세요.');
      }
      ids.add(task.id);reserved.push(task);
    }
  }
  add(task){return this.addMany([task])[0];}
  addMany(tasks){
    this.checkMany(tasks);
    const items=tasks.map(task=>({...task,state:'queued',createdAt:Date.now(),controller:new AbortController()}));
    this.items.push(...items);
    for(const item of items)this.emit(item);
    this.schedule();
    return items;
  }
  schedule(){if(this.scheduled||this.active)return;this.scheduled=true;queueMicrotask(()=>{this.scheduled=false;void this.drain();});}
  async drain(){
    if(this.active)return;const task=this.items.find(t=>t.state==='queued');if(!task){this.waiters.splice(0).forEach(r=>r());return;}
    this.active=task;task.state='running';task.startedAt=Date.now();this.emit(task);
    try{await this.execute(task,task.controller.signal);task.state=task.controller.signal.aborted?'cancelled':'completed';}
    catch(error){task.state=task.controller.signal.aborted?'cancelled':'failed';task.error=error.message||String(error);}
    finally{task.finishedAt=Date.now();this.active=null;task.snapshot=null;task.controller=null;while(this.items.length>30){const index=this.items.findIndex(t=>!['queued','running','cancelling'].includes(t.state)&&!t.unsavedImage);if(index<0)break;this.items.splice(index,1);}this.emit(task);this.schedule();}
  }
  async cancel(id){const task=this.items.find(t=>t.id===id);if(!task)return;if(task.state==='queued'){task.state='cancelled';task.finishedAt=Date.now();task.snapshot=null;task.controller=null;this.emit(task);this.schedule();return;}if(task.state!=='running')return;task.controller.abort();task.state='cancelling';this.emit(task);await this.cancelRun(task);}
  idle(){if(!this.pending.length&&!this.active)return Promise.resolve();return new Promise(resolve=>this.waiters.push(resolve));}
}

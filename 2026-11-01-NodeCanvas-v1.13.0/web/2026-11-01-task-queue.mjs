// One connector job at a time. All task ownership is explicit and independent of the visible project.
export class TaskQueue {
  constructor({execute,cancel=async()=>{},onChange=()=>{},limit=8}){Object.assign(this,{execute,cancelRun:cancel,onChange,limit,items:[],active:null,scheduled:false,waiters:[]});}
  get pending(){return this.items.filter(t=>['queued','running','cancelling'].includes(t.state));}
  hasProject(id){return this.pending.some(t=>t.projectId===id);}
  locked(projectId,nodeId){return this.pending.some(t=>t.projectId===projectId&&t.nodeIds.includes(nodeId));}
  emit(task){this.onChange(task);}
  add(task){
    if(this.pending.length>=this.limit)throw Error(`작업은 실행 중인 작업을 포함해 ${this.limit}개까지 등록할 수 있습니다.`);
    const writes=task.writeIds||task.nodeIds;
    if(this.pending.some(t=>t.projectId===task.projectId&&((t.writeIds||t.nodeIds).some(id=>task.nodeIds.includes(id))||writes.some(id=>t.nodeIds.includes(id)))))throw Error('이미 실행 또는 대기 중인 노드가 포함되어 있습니다. 다른 노드에서 새 작업을 준비하세요.');
    const item={...task,state:'queued',createdAt:Date.now(),controller:new AbortController()};this.items.push(item);this.emit(item);this.schedule();return item;
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

import {getSkill} from './2026-11-01-skills.mjs';
import {initializeSpaces,listSpaces,getSpace,addSpace,changeSpace,duplicateSpace,purgeSpace,storageEstimate} from './2026-10-31-storage.mjs';
import {storageSummary} from './2026-11-01-usage.mjs';
import {filterSpaces} from './2026-10-31-spaces.mjs';
import {starterProject,isImage} from './2026-10-31-graph.mjs';
const $=id=>document.getElementById(id),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const colors={skill:'#fff0da',prompt:'#e8edff',image:'#fde0f0',generate:'#fff4c4',edit:'#c3faf5',result:'#ffe6cd'};
function thumbnail(project){
 if(!project.nodes.length)return '<svg viewBox="0 0 320 220" aria-hidden="true"><rect x="130" y="80" width="60" height="60" rx="10" fill="white" stroke="#d5d9e2"/><text x="160" y="119" text-anchor="middle" fill="#7c8391" font-size="28">＋</text></svg>';
 const nodes=project.nodes,minX=Math.min(...nodes.map(n=>n.x))-50,minY=Math.min(...nodes.map(n=>n.y))-65,maxX=Math.max(...nodes.map(n=>n.x+320))+50,maxY=Math.max(...nodes.map(n=>n.y+300))+50;
 const byId=new Map(nodes.map(n=>[n.id,n]));
 let content=project.edges.map(e=>{const a=byId.get(e.from),b=byId.get(e.to);if(!a||!b)return '';const x=a.x+320,y=a.y+100,xx=b.x,yy=b.y+100;return `<path d="M${x} ${y} C${x+90} ${y} ${xx-90} ${yy} ${xx} ${yy}" fill="none" stroke="#8298df" stroke-width="3"/>`;}).join('');
 for(const n of project.nodes){content+=`<g transform="translate(${n.x},${n.y})"><rect width="320" height="300" rx="12" fill="white" stroke="#d3d8e2" stroke-width="2"/><rect width="320" height="28" rx="12" fill="${colors[n.type]}"/><text x="14" y="20" fill="#343946" font-size="14">${esc((n.data.label||n.type).slice(0,28))}</text>`;
 if(isImage(n.data.image))content+=`<image href="${esc(n.data.image)}" x="8" y="36" width="304" height="256" preserveAspectRatio="xMidYMid meet"/>`;
 else if(n.type==='skill')content+=`<text x="20" y="80" fill="#81541c" font-size="18">${esc(getSkill(n.data.skill)?.name||'스킬')} · 스킬</text>`;
 else if(n.type==='prompt')content+=`<text x="18" y="68" fill="#707786" font-size="16">${esc((n.data.text||'프롬프트를 입력하세요').slice(0,22))}</text>`;
 else content+=`<text x="160" y="166" text-anchor="middle" fill="#b9bfcb" font-size="38">${n.type==='image'?'↥':'✦'}</text>`;
 content+='</g>';}
 return `<svg viewBox="${minX} ${minY} ${maxX-minX} ${maxY-minY}" aria-hidden="true">${content}</svg>`;
}
export async function initializeLibrary({beforeLeave,afterTransition,openProject,onLibrary,backupProject,notify,canRemoveProject=()=>true}){
 let records=[],trash=false,query='',locked=false,nameTarget=null,trashTarget=null,purgeTarget=null,refreshNumber=0;
 const date=new Intl.DateTimeFormat('ko-KR',{month:'long',day:'numeric',hour:'2-digit',minute:'2-digit'});
 function render(){
  const list=filterSpaces(records,query,trash);$('spaces-count').textContent=records.filter(r=>!r.trashed).length;$('trash-count').textContent=records.filter(r=>r.trashed).length;
  for(const [id,on] of [['spaces-active',!trash],['spaces-trash',trash]]){$(id).classList.toggle('active',on);$(id).setAttribute('aria-pressed',String(on));}
  $('spaces-caption').textContent=trash?'휴지통 · 복원할 수 있어요':'최근 수정한 프로젝트';$('spaces-results').textContent=list.length+'개 프로젝트';$('spaces-grid').setAttribute('aria-busy',String(locked));
  $('spaces-grid').innerHTML=list.map(r=>`<article class="space-card"><button class="space-preview" data-space-action="${trash?'restore':'open'}" data-space-id="${esc(r.id)}" aria-label="${esc(r.project.name)} ${trash?'복원':'열기'}" ${locked?'disabled':''}>${thumbnail(r.project)}<span class="space-card-count">${r.nodeCount??r.project.nodes.length}개 노드 · ${r.edgeCount??r.project.edges.length}개 연결</span></button><div class="space-card-meta"><div class="space-card-info"><button class="space-card-title" data-space-action="${trash?'restore':'open'}" data-space-id="${esc(r.id)}" ${locked?'disabled':''}>${esc(r.project.name)}</button><time datetime="${new Date(r.updatedAt).toISOString()}">${date.format(r.updatedAt)} ${trash?'휴지통으로 이동':'수정'}</time></div></div><div class="space-card-tools">${trash?`<button data-space-action="restore" data-space-id="${esc(r.id)}" ${locked?'disabled':''}>복원하기</button><button data-space-action="backup" data-space-id="${esc(r.id)}" ${locked?'disabled':''}>JSON 백업</button><button class="trash-action" data-space-action="purge" data-space-id="${esc(r.id)}" ${locked?'disabled':''}>영구 삭제</button>`:`<button data-space-action="rename" data-space-id="${esc(r.id)}" ${locked?'disabled':''}>이름 변경</button><button data-space-action="duplicate" data-space-id="${esc(r.id)}" ${locked?'disabled':''}>복제</button><button class="trash-action" data-space-action="trash" data-space-id="${esc(r.id)}" ${locked?'disabled':''}>휴지통</button>`}</div></article>`).join('');
  $('spaces-empty').hidden=list.length>0;$('spaces-empty-title').textContent=query?'검색 결과가 없어요':trash?'휴지통이 비어 있어요':'아직 프로젝트가 없어요';$('spaces-empty-description').textContent=query?'다른 이름으로 검색해 보세요.':trash?'휴지통으로 옮긴 프로젝트를 여기에서 복원할 수 있어요.':'새 프로젝트를 만들고 첫 아이디어를 놓아 보세요.';$('empty-new-space').hidden=trash||Boolean(query);
  $('new-space').disabled=$('import-space').disabled=$('empty-new-space').disabled=locked;
 }
 async function refresh(){const sequence=++refreshNumber;const latest=await listSpaces();if(sequence===refreshNumber){records=latest;render();void showUsage();}}
 async function showUsage(){const value=await storageEstimate();$('storage-usage').textContent=storageSummary(value);}
 async function action(fn){if(locked)return;locked=true;render();try{await fn();}catch(error){notify(error.message,true);}finally{locked=false;afterTransition();await refresh().catch(e=>notify(e.message,true));}}
 async function enter(record){if(!record||record.trashed)throw new Error('열 수 없는 프로젝트입니다.');await beforeLeave();await openProject(await getSpace(record.id));document.body.classList.remove('show-library');$('project-name').focus();}
 async function show(){return action(async()=>{await beforeLeave();await refresh();document.body.classList.add('show-library');onLibrary();$('new-space').focus();});}
 async function create(next){await beforeLeave();const record=await addSpace(next);await enter(record);}
 $('new-space').onclick=$('empty-new-space').onclick=()=>action(()=>create({...starterProject(),name:'새 프로젝트',nodes:[],edges:[]}));
 $('spaces-active').onclick=()=>{trash=false;render();};$('spaces-trash').onclick=()=>{trash=true;render();};$('space-search').oninput=e=>{query=e.target.value;render();};
 $('spaces-grid').onclick=event=>{const button=event.target.closest('[data-space-action]');if(!button||locked)return;const id=button.dataset.spaceId,kind=button.dataset.spaceAction;if(kind==='purge'){purgeTarget=id;$('purge-project-name').textContent=records.find(r=>r.id===id).project.name;$('purge-confirm-text').value='';$('purge-confirm').disabled=true;$('purge-error').textContent='';$('purge-dialog').showModal();$('purge-cancel').focus();return;}if(kind==='trash'){trashTarget=id;$('trash-project-name').textContent=records.find(r=>r.id===id).project.name;$('trash-error').textContent='';$('trash-dialog').showModal();$('trash-cancel').focus();return;}if(kind==='rename'){nameTarget=id;$('space-name-input').value=records.find(r=>r.id===id).project.name;$('space-name-error').textContent='';$('space-name-dialog').showModal();$('space-name-input').select();return;}void action(async()=>{if(kind==='open')return enter(await getSpace(id));await beforeLeave();if(kind==='backup'){backupProject(await getSpace(id));return;}if(kind==='duplicate'){await duplicateSpace(id);notify('프로젝트를 복제했습니다.');}if(kind==='restore'){await changeSpace(id,{trashed:false});notify('내 프로젝트로 복원했습니다.');}});};
 $('purge-confirm-text').oninput=()=>{$('purge-confirm').disabled=$('purge-confirm-text').value!=='삭제'||locked;};
 $('purge-cancel').onclick=()=>{if(!locked){purgeTarget=null;$('purge-dialog').close();}};
 $('purge-dialog').addEventListener('cancel',event=>{if(locked)event.preventDefault();else purgeTarget=null;});
 $('purge-confirm').onclick=async()=>{if(locked||!purgeTarget||$('purge-confirm-text').value!=='삭제')return;locked=true;$('purge-confirm').disabled=$('purge-cancel').disabled=true;try{await beforeLeave();if(!canRemoveProject(purgeTarget))throw new Error('이 프로젝트의 작업을 완료하거나 취소한 뒤 삭제하세요.');await purgeSpace(purgeTarget);purgeTarget=null;$('purge-dialog').close();notify('프로젝트와 연결된 저장 자료를 영구 삭제했습니다.');await refresh();}catch(error){$('purge-error').textContent=error.message;}finally{locked=false;afterTransition();$('purge-cancel').disabled=false;$('purge-confirm').disabled=$('purge-confirm-text').value!=='삭제';render();}};
 $('trash-cancel').onclick=()=>{if(!locked){trashTarget=null;$('trash-dialog').close();}};
 $('trash-confirm').onclick=async()=>{if(locked||!trashTarget)return;locked=true;$('trash-confirm').disabled=$('trash-cancel').disabled=true;try{await beforeLeave();if(!canRemoveProject(trashTarget))throw new Error('이 프로젝트의 작업을 완료하거나 취소한 뒤 휴지통으로 옮기세요.');await changeSpace(trashTarget,{trashed:true});trashTarget=null;$('trash-dialog').close();notify('휴지통으로 옮겼습니다. 언제든 복원할 수 있어요.');await refresh();}catch(error){$('trash-error').textContent=error.message;}finally{locked=false;afterTransition();$('trash-confirm').disabled=$('trash-cancel').disabled=false;render();}};
 $('trash-dialog').addEventListener('cancel',event=>{if(locked)event.preventDefault();else trashTarget=null;});
 $('space-name-close').onclick=$('space-name-cancel').onclick=()=>$('space-name-dialog').close();
 $('space-name-form').onsubmit=async event=>{event.preventDefault();if(locked)return;const name=$('space-name-input').value.trim();if(!name){$('space-name-error').textContent='프로젝트 이름을 입력해 주세요.';return;}locked=true;$('space-name-save').disabled=true;try{await beforeLeave();await changeSpace(nameTarget,{name});$('space-name-dialog').close();await refresh();}catch(error){$('space-name-error').textContent=error.message;}finally{locked=false;afterTransition();$('space-name-save').disabled=false;render();}};
 records=await initializeSpaces(starterProject());render();void showUsage();
 return {show,importProject:next=>action(()=>create(next)),refresh};
}

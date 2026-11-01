import {nodeIcon,portIcon} from './2026-11-01-icons.mjs';
import {HAIRLOCK,buildSkillPrompt} from './2026-11-01-skills.mjs';
import {initializeUpdates} from './2026-11-01-updates.mjs';
import {TYPES,outputKind,canConnect,validateGraph,executionOrder,collectInputs,restoreProject,normalizeProject,projectJSON,projectBytes,MAX_PROJECT_BYTES,MAX_NODE_COUNT,starterProject,editProject,isImage} from './2026-10-31-graph.mjs';
import {CATALOG,NODE_HELP,authPhase,officialLoginUrl,filterCatalog,requiresMedia} from './2026-10-31-catalog.mjs';
import {projectUsage,usageNotice} from './2026-11-01-usage.mjs';
import {promptPresentation} from './2026-11-01-node-layout.mjs';
import {uploadApplies} from './2026-10-31-assets.mjs';
import {EditHistory} from './2026-10-31-history.mjs';
import {saveProject} from './2026-10-31-storage.mjs';
import {settleEdits} from './2026-10-31-spaces.mjs';
import {initializeLibrary} from './2026-10-31-library.mjs';
import {NODE_WIDTH,nodeDragAllowed,uploadClick,PORT_Y,portsFor,portOffset,screenToWorld,curvePath,makeConnection,compatibleTypes,menuPosition,isImeKey} from './2026-10-31-canvas.mjs';

const $=id=>document.getElementById(id);
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uuid=()=>crypto.randomUUID();
const descriptions={prompt:'장면과 스타일을 글로',image:'내 이미지에서 시작하기',generate:'상상한 장면을 이미지로',edit:'이미지를 원하는 모습으로'};
const tints={skill:'#fff0da',prompt:'#e8edff',image:'#fde0f0',generate:'#fff4c4',edit:'#c3faf5'};
let projectSession=0;
let activeSpaceId=null,library=null,dirty=false,saveRevision=0,saveQueue=Promise.resolve();
let project=starterProject(),selected='generate-start',pendingPort=null,drag=null;
let view={x:0,y:0,scale:1},saveTimer,toastTimer,busy=false,cancelled=false,activeJob=null,uploadTarget=null;
let menuContext=null,actionTarget=null,suppressClickUntil=0,menuCategory='all',tool='select';
const runStates={},history=[];
const bridge={url:'http://127.0.0.1:7330',token:'',connected:false,account:null,loginPending:false};
let updates=null;
let leaseController=null,leaseToken='',connectorPresent=false;
let authAttempt=0,loginRequestBusy=false;
const tabId=uuid(),editHistory=new EditHistory(),spaceRevisions=new Map();

function notify(message,error=false){$('toast').textContent=message;$('toast').classList.toggle('error',error);$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,error?7500:4200);}
let usageFrame=0;
function scheduleUsage(){if(usageFrame)return;usageFrame=requestAnimationFrame(()=>{usageFrame=0;const metrics=projectUsage(project),notice=usageNotice(metrics);$('project-usage-metrics').innerHTML=metrics.map(m=>`<span class="usage-metric ${m.level}" data-usage="${m.key}">${m.display}</span>`).join('');$('project-usage').dataset.severity=notice.severity;const warning=$('project-usage-warning');if(warning.textContent!==notice.text)warning.textContent=notice.text;warning.hidden=!notice.text;});}
function connectionMessage(message,error=false){$('connection-message').textContent=message;$('connection-message').classList.toggle('error',error);}
function editable(){if(busy){notify('실행이 끝난 뒤 워크플로를 수정하세요.');return false;}return true;}
function scheduleSave(){
 scheduleUsage();
 if(!activeSpaceId)return;dirty=true;saveRevision++;$('save-state').dataset.state='saving';$('save-state').textContent='저장 중…';clearTimeout(saveTimer);saveTimer=setTimeout(()=>void persistCurrent().catch(error=>{notify(error.message,true);}),400);
}
async function persistCurrent(){
 
 if(!activeSpaceId||!dirty)return saveQueue;
 let snapshot;try{snapshot=normalizeProject(project);}catch(error){$('save-state').dataset.state='error';$('save-state').textContent='저장 실패';$('retry-save').hidden=false;throw error;}
 const id=activeSpaceId,revision=saveRevision;
 saveQueue=saveQueue.catch(()=>{}).then(()=>saveProject(snapshot,id,{expectedRevision:spaceRevisions.get(id)})).then(record=>{spaceRevisions.set(id,record.revision);if(revision===saveRevision){dirty=false;$('save-state').dataset.state='saved';$('save-state').textContent='자동 저장됨';$('retry-save').hidden=true;}}).catch(error=>{$('save-state').dataset.state='error';$('save-state').textContent='저장 실패';$('retry-save').hidden=false;throw error;});return saveQueue;
}
async function leaveProject(){if(!editable())throw new Error('실행을 완료한 뒤 프로젝트를 전환하세요.');document.querySelector('.app-header').inert=true;document.querySelector('.workspace').inert=true;clearTimeout(saveTimer);await settleEdits(()=>dirty,persistCurrent);cancelWire();closeMenus();}
function enterProject(record){const next=normalizeProject(record.project,{allowOversized:true});projectSession++;activeSpaceId=record.id;spaceRevisions.set(record.id,record.revision);project=next;dirty=false;selected=null;editHistory.reset(project);Object.keys(runStates).forEach(k=>delete runStates[k]);history.length=0;historyRender();renderAll();readableView();$('retry-save').hidden=true;$('save-state').dataset.state='saved';$('save-state').textContent='자동 저장됨';if(projectBytes(project)>MAX_PROJECT_BYTES)notify('이전 저장본이 200MB를 넘습니다. 이미지를 개별 저장하고 노드를 줄이면 다시 저장할 수 있어요.',true);}
function releaseProject(){projectSession++;activeSpaceId=null;project={version:'1.0.0',name:'',nodes:[],edges:[]};dirty=false;selected=null;editHistory.reset(project);Object.keys(runStates).forEach(k=>delete runStates[k]);history.length=0;historyRender();$('image-file').value='';renderAll();}
function updateEditControls(){$('undo-edit').disabled=busy||!editHistory.canUndo;$('redo-edit').disabled=busy||!editHistory.canRedo;}
function checkpoint(group=null){editHistory.record(project,group);updateEditControls();}
function undoEdit(redo=false){if(!editable())return;const next=redo?editHistory.redo():editHistory.undo();if(!next)return;project=next;selected=null;cancelWire();closeMenus();renderAll();scheduleSave();}
function updateView(){
  $('world').style.transform=`translate(${view.x}px,${view.y}px) scale(${view.scale})`;
  $('zoom-label').textContent=Math.round(view.scale*100)+'%';
  $('viewport').style.backgroundSize=`${24*view.scale}px ${24*view.scale}px`;
  $('viewport').style.backgroundPosition=`${view.x}px ${view.y}px`;
}
function fitView(){
  if(!project.nodes.length){view={x:0,y:0,scale:1};return updateView();}
  const minX=Math.min(...project.nodes.map(n=>n.x)),minY=Math.min(...project.nodes.map(n=>n.y));
  const maxX=Math.max(...project.nodes.map(n=>n.x+NODE_WIDTH));
  const maxY=Math.max(...project.nodes.map(n=>n.y+(document.querySelector(`[data-node="${n.id}"]`)?.offsetHeight||400)));
  const bounds=$('viewport').getBoundingClientRect();
  const scale=Math.max(.2,Math.min(1,(bounds.width-100)/(maxX-minX),(bounds.height-170)/(maxY-minY)));
  view={scale,x:(bounds.width-(maxX-minX)*scale)/2-minX*scale,y:95-minY*scale};updateView();
}
function readableView(){
  const minX=Math.min(64,...project.nodes.map(n=>n.x)),minY=project.nodes.length?Math.min(...project.nodes.map(n=>n.y)):90;
  view={scale:1,x:Math.max(0,40-minX),y:90-minY};updateView();
}
function zoom(amount,clientX,clientY){
  const rect=$('viewport').getBoundingClientRect(),x=clientX??rect.width/2,y=clientY??rect.height/2;
  const scale=Math.min(2,Math.max(.2,view.scale*amount));view.x=x-(x-view.x)*scale/view.scale;view.y=y-(y-view.y)*scale/view.scale;view.scale=scale;updateView();
}
function portPoint(id,direction,kind){const n=project.nodes.find(n=>n.id===id);return {x:n.x+(direction==='output'?NODE_WIDTH:0),y:n.y+(Number.parseFloat(document.querySelector(`[data-node="${id}"] .port.${direction}${kind?'.port-'+kind:''}`)?.style.getPropertyValue('--port-y'))||portOffset(n.type,direction,kind))};}
function renderEdges(){
  $('edges').innerHTML=project.edges.map(edge=>{
    const source=project.nodes.find(n=>n.id===edge.from),target=project.nodes.find(n=>n.id===edge.to);if(!source||!target)return '';
    const d=curvePath(portPoint(source.id,'output'),portPoint(target.id,'input',outputKind(source.type)));
    return `<g class="edge-group" data-edge="${esc(edge.id)}" style="--edge-color:${source.type==='skill'?'#a36b26':TYPES[source.type].output==='text'?'#4262ff':'#79609e'}" role="button" tabindex="0" aria-label="${esc(source.data.label||TYPES[source.type].label)}에서 ${esc(target.data.label||TYPES[target.type].label)} 연결 해제"><path class="edge-hit" d="${d}"/><path class="edge" d="${d}"/></g>`;
  }).join('');
}
function renderWire(point){
  if(!pendingPort||!point){$('wire-preview').innerHTML='';return;}
  const origin=portPoint(pendingPort.id,pendingPort.direction,pendingPort.kind);
  const d=pendingPort.direction==='output'?curvePath(origin,point):curvePath(point,origin);
  $('wire-preview').innerHTML=`<path class="wire" d="${d}"/>`;
}
function preview(node,kind='generate'){
  if(isImage(node.data.image)){const img=`<img class="node-preview" src="${node.data.image}" alt="${esc(TYPES[node.type].label)} 이미지" draggable="false">`;return node.type==='image'?`<div class="upload-surface" data-upload-surface role="button" tabindex="0" aria-label="업로드 이미지 바꾸기">${img}</div>`:img;}
  if(kind==='image')return '<button type="button" class="image-placeholder upload-node" data-upload-surface aria-label="이미지 파일 선택"><span class="placeholder-symbol">↥</span><strong>이미지 업로드</strong><span>파일을 선택해 시작하세요</span></button>';
  return `<div class="image-placeholder media-empty"><span class="placeholder-symbol">✦</span><span>이미지 미리보기</span></div>`;
}
function promptSources(info){return info.sources.length?`<div class="prompt-source-status">연결된 텍스트 사용 중${info.sources.map(source=>`<button type="button" data-prompt-source="${esc(source.id)}" title="원본 텍스트 편집">${esc(source.label)}${source.empty?' · 내용 없음':''} ↗</button>`).join('')}</div>`:'';}
function field(n,label,short=false){const info=short?promptPresentation(project,n):{label,placeholder:'원하는 장면이나 재사용할 지시문을 입력하세요…',sources:[]};return `${short?`<div class="prompt-sources" data-sources-for="${esc(n.id)}">${promptSources(info)}</div>`:''}<label class="node-field ${short?'inline-prompt':''}"><span class="field-label">${esc(info.label)}</span><textarea class="node-text ${short?'short':''}" data-field="text" aria-label="${esc(TYPES[n.type].label)} ${esc(info.label)}" maxlength="16000" ${busy?'disabled':''} placeholder="${esc(hasSkill(n)?'예: 얼굴과 배경은 유지하고 앞머리가 있는 단발로 바꿔 주세요…':info.placeholder)}">${esc(n.data.text||'')}</textarea></label>`;}
function hasSkill(node){return project.edges.some(e=>e.to===node.id&&project.nodes.find(n=>n.id===e.from)?.type==='skill');}
function skillStatus(node){return hasSkill(node)?`<div class="skill-connected">${nodeIcon('skill')}<span>HairLock 연결됨</span></div>`:'';}
function refreshPromptGuidance(){for(const node of project.nodes.filter(n=>['generate','edit'].includes(n.type))){const el=document.querySelector(`[data-node="${node.id}"]`);if(!el)continue;const info=promptPresentation(project,node),input=el.querySelector('textarea');el.querySelector('.prompt-sources').innerHTML=promptSources(info);el.querySelector('.inline-prompt .field-label').textContent=info.label;input.placeholder=hasSkill(node)?'예: 얼굴과 배경은 유지하고 앞머리가 있는 단발로 바꿔 주세요…':info.placeholder;input.setAttribute('aria-label',TYPES[node.type].label+' '+info.label);}}
const mediaObserver=new ResizeObserver(entries=>{for(const entry of entries){const el=entry.target.closest('[data-node]');if(!el)continue;const node=project.nodes.find(n=>n.id===el.dataset.node);if(!node)continue;const inputs=portsFor(node.type).filter(p=>p.direction==='input'),center=Math.max(inputs.length===3?48:0,entry.target.offsetHeight/2),spread=32;for(const port of el.querySelectorAll('.port')){const index=inputs.findIndex(p=>p.kind===port.dataset.inputKind),offset=inputs.length===3?(index-1)*spread:port.dataset.inputKind==='prompt'?-spread:spread;port.style.setProperty('--port-y',(port.classList.contains('input')?center+offset:center)+'px');}}renderEdges();});
function observeMedia(){mediaObserver.disconnect();document.querySelectorAll('.node-content > .node-preview,.upload-surface').forEach(el=>mediaObserver.observe(el));}
function renderPorts(node){return portsFor(node.type).map(port=>`<button type="button" class="port ${port.direction} port-${port.kind}" style="--port-y:${portOffset(node.type,port.direction,port.kind)}px" data-${port.direction}="${esc(node.id)}" data-input-kind="${port.kind}" aria-label="${esc(TYPES[node.type].label)} ${port.label} ${port.direction==='input'?'입력':'출력'} 연결" title="${port.label} · ${port.description}"><span class="port-icon" aria-hidden="true">${portIcon(port.kind)}</span><span class="port-caption" aria-hidden="true">${port.label}</span><span class="port-description" aria-hidden="true">${port.description}</span></button>`).join('');}
function renderNodeTools(node){const type=TYPES[node.type];return `<div class="node-tools" role="group" aria-label="${esc(type.label)} 빠른 도구">${type.output==='image'?`<button type="button" data-action="download" aria-label="${esc(type.label)} 이미지 저장" title="이미지 저장 · AI를 다시 실행하지 않습니다" ${!isImage(node.data.image)?'disabled':''}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M12 3v12m-5-5 5 5 5-5M5 16v4h14v-4"/></svg><span class="tool-tip">이미지 저장</span></button>`:''}<button type="button" data-action="duplicate" aria-label="${esc(type.label)} 노드 복제" title="노드 복제" ${busy?'disabled':''}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V4H4v12h4"/></svg><span class="tool-tip">복제</span></button><button type="button" data-action="delete" aria-label="${esc(type.label)} 노드 삭제" title="노드 삭제" ${busy?'disabled':''}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7"/></svg><span class="tool-tip">삭제</span></button></div>`;}
function renderNodes(){
  
  $('nodes').innerHTML=project.nodes.map((n,index)=>{
    const type=TYPES[n.type],state=runStates[n.id],media=requiresMedia(n.type);let content='';
    if(n.type==='skill')content=`<div class="skill-card-body"><span class="skill-version">기본 제공 · v1.0.1</span><p>얼굴 특징을 유지하며<br>헤어스타일을 바꿉니다.</p><button type="button" class="text-button" data-action="skill-view">${nodeIcon('prompt')} 원문 보기</button><small>편집 노드의 스킬 입력에 연결하세요.</small></div>`;
    if(n.type==='prompt')content=`${field(n,'프롬프트')}<div class="text-footer"><span data-char-count>${(n.data.text||'').length}자</span><span>텍스트</span></div>`;
    if(n.type==='image')content=preview(n,'image')+(n.data.image?'<div class="node-settings"><button class="button quiet" data-action="upload">이미지 바꾸기</button><button class="button quiet" data-action="download">저장 ↗</button></div>':'');
    if(['generate','edit'].includes(n.type))content=`${preview(n,n.type==='generate'?'generate':'edit')}${n.type==='edit'?skillStatus(n):''}${field(n,n.type==='edit'?'편집 지시':'프롬프트',true)}<div class="node-settings"><label class="ratio-control"><span class="field-label">비율</span><select data-field="ratio" aria-label="${esc(type.label)} 이미지 비율" ${busy?'disabled':''}>${['1:1','3:2','2:3','16:9','9:16'].map(r=>`<option ${r===(n.data.ratio||'1:1')?'selected':''}>${r}</option>`).join('')}</select></label><button class="button primary node-run" data-run="${esc(n.id)}" ${busy?'disabled':''}>${n.type==='edit'?'편집하기':'생성하기'} <span>↗</span></button>${n.data.image?'<button class="icon-button" data-action="download" aria-label="생성 이미지 저장">↓</button>':''}</div>`;
    const status=state?.state==='running'?'생성 중':state?.state==='completed'?'완료':state?.state==='failed'?'확인 필요':'';
    return `<article class="node ${media?'media-node':n.type==='skill'?'text-node skill-node':'text-node'} ${selected===n.id?'selected':''} ${state?.state==='failed'?'error-node':''}" style="left:${n.x}px;top:${n.y}px;--node-tint:${tints[n.type]};--port-color:${n.type==='skill'?'#a36b26':type.output==='text'?'#4262ff':'#79609e'}" data-node="${esc(n.id)}" aria-label="${esc(type.label)} 노드"><div class="node-header" data-drag="${esc(n.id)}"><span class="node-icon" title="이 영역을 끌어 노드 이동">${nodeIcon(n.type)}</span><input class="node-label" data-field="label" aria-label="${esc(type.label)} 노드 이름" value="${esc(n.data.label||type.label)}" maxlength="80" ${busy?'disabled':''}><button class="node-help" data-action="help" aria-label="${esc(type.label)} 사용 방법" title="${esc(type.label)} 사용 방법">?</button><span class="node-state ${esc(state?.state||'')}">${esc(status)}</span><button class="node-more" data-action="more" aria-label="${esc(type.label)} 노드 작업">⋯</button></div>${renderPorts(n)}${renderNodeTools(n)}<div class="node-content">${content}</div></article>`;
  }).join('');
  observeMedia();renderEdges();scheduleUsage();$('graph-stats').textContent=`${project.nodes.length}개 노드 · ${project.edges.length}개 연결`;$('empty-state').hidden=project.nodes.length>0;updatePendingPorts();
}
function updatePendingPorts(){
 $('world').classList.toggle('connecting',Boolean(pendingPort));
 document.querySelectorAll('.port').forEach(el=>{const port=pointerPort(el),same=pendingPort?.id===port.id&&pendingPort.direction===port.direction&&pendingPort.kind===port.kind;const pair=wirePair(pendingPort,port);const compatible=Boolean(pair&&canConnect(project.nodes.find(n=>n.id===pair.from),project.nodes.find(n=>n.id===pair.to),pair.inputKind));el.classList.toggle('pending',Boolean(same));el.classList.toggle('compatible',compatible);el.classList.toggle('incompatible',Boolean(pendingPort&&!same&&!compatible));});
}
function renderAll(){renderNodes();$('project-name').value=project.name;updateEditControls();}
function changed(){checkpoint();renderAll();scheduleSave();}
function select(id){selected=id;document.querySelectorAll('.node').forEach(el=>el.classList.toggle('selected',el.dataset.node===id));renderEdges();}
function closeMenus(returnFocus=false){$('node-menu').hidden=true;$('action-menu').hidden=true;$('template-menu').hidden=true;menuContext=null;if(returnFocus)$('viewport').focus({preventScroll:true});}
function cancelWire(){pendingPort=null;drag=null;renderWire();updatePendingPorts();document.querySelectorAll('.compatible').forEach(el=>el.classList.remove('compatible'));}
function deleteNode(id){if(!editable())return;const node=project.nodes.find(n=>n.id===id);if(!node||!confirm(`“${node.data.label||TYPES[node.type].label}” 노드와 연결을 삭제할까요?`))return;project.nodes=project.nodes.filter(n=>n.id!==id);project.edges=project.edges.filter(e=>e.from!==id&&e.to!==id);selected=null;cancelWire();closeMenus();changed();}
function duplicateNode(id){if(!editable())return;const node=project.nodes.find(n=>n.id===id);if(!node)return;if(project.nodes.length>=MAX_NODE_COUNT)return notify('노드는 150개까지 추가할 수 있습니다.',true);const copy=structuredClone(node);copy.id=uuid();copy.x+=45;copy.y+=55;project.nodes.push(copy);selected=copy.id;closeMenus();changed();}
function tryConnect(from,to,inputKind=null){
  if(!editable())return false;
  try{project.edges.push(makeConnection(project,from,to,uuid(),inputKind));cancelWire();$('canvas-hint').textContent='연결했습니다 · 입력한 내용이 다음 노드로 전달됩니다';checkpoint();renderNodes();scheduleSave();return true;}catch(error){notify(error.message,true);return false;}
}
function addNode(type){
  if(!editable())return;if(project.nodes.length>=MAX_NODE_COUNT)return notify('노드는 150개까지 추가할 수 있습니다.',true);
  const rect=$('viewport').getBoundingClientRect(),location=menuContext?.world||screenToWorld({x:rect.left+rect.width/2,y:rect.top+rect.height/2},rect,view);
  const node={id:uuid(),type,x:Math.round(location.x),y:Math.round(location.y),data:{...(type==='skill'?{skill:HAIRLOCK.id}:{}),text:'',ratio:'1:1',label:TYPES[type].label}};
  const origin=menuContext?.port;const candidate={...project,nodes:[...project.nodes,node]};
  if(origin){try{const edge=origin.direction==='output'?makeConnection(candidate,origin.id,node.id,uuid()):makeConnection(candidate,node.id,origin.id,uuid(),origin.kind);project.edges.push(edge);}catch(error){return notify(error.message,true);}}
  project.nodes.push(node);selected=node.id;cancelWire();closeMenus();changed();
  requestAnimationFrame(()=>document.querySelector(`[data-node="${node.id}"] textarea`)?.focus({preventScroll:true}));
}
function menuTypes(){
  const source=menuContext?.port;
  if(!source)return Object.keys(TYPES);
  const node=project.nodes.find(n=>n.id===source.id);
  return source.direction==='output'?compatibleTypes(node):Object.keys(TYPES).filter(type=>canConnect({id:'new-node',type},node,source.kind));
}
function renderMenu(){
  const list=filterCatalog({query:$('node-search').value,category:menuCategory,allowed:menuTypes()});
  $('menu-items').innerHTML=list.length?list.map(type=>{
    const entry=CATALOG.find(n=>n.type===type);
    return `<button class="menu-item" data-add="${type}"><span class="item-icon" style="--node-tint:${tints[type]}">${nodeIcon(type)}</span><span><strong>${entry.label}</strong><small>${esc(entry.description)}</small></span></button>`;
  }).join(''):'<div class="menu-empty">이 분류에 맞는 노드가 없어요.</div>';
  document.querySelectorAll('[data-category]').forEach(button=>{button.classList.toggle('active',button.dataset.category===menuCategory);button.setAttribute('aria-pressed',String(button.dataset.category===menuCategory));});
}
function openNodeMenu(x,y,port=null){
  if(!editable())return;closeMenus();
  menuContext={world:screenToWorld({x,y},$('viewport').getBoundingClientRect(),view),port};
  $('menu-title').textContent=port?'연결할 노드 추가':'노드 추가';$('node-search').value='';menuCategory='all';renderMenu();$('node-menu').hidden=false;
  const size=$('node-menu').getBoundingClientRect(),pos=menuPosition({x,y},{width:innerWidth,height:innerHeight},size);
  $('node-menu').style.left=pos.x+'px';$('node-menu').style.top=pos.y+'px';$('node-search').focus({preventScroll:true});
}
function openActionMenu(id,x,y){if(!editable())return;closeMenus();actionTarget=id;select(id);$('action-menu').hidden=false;const size=$('action-menu').getBoundingClientRect(),pos=menuPosition({x,y},{width:innerWidth,height:innerHeight},size);$('action-menu').style.left=pos.x+'px';$('action-menu').style.top=pos.y+'px';$('duplicate-node').focus({preventScroll:true});}
function chooseImage(id){if(!editable())return;uploadTarget=id;$('image-file').value='';$('image-file').click();}
function downloadBlob(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);}
function downloadImage(data){if(!isImage(data))return;const type=data.slice(5,data.indexOf(';')),bytes=Uint8Array.from(atob(data.split(',')[1]),c=>c.charCodeAt(0));downloadBlob(new Blob([bytes],{type}),`2026-10-31-NodeCanvas-image-v1.11.0.${type.split('/')[1]}`);}
function exportProjectRecord(record){try{const graph=record.project||record;downloadBlob(new Blob([projectJSON(graph)],{type:'application/json'}),`2026-10-31-NodeCanvas-${graph.name.replace(/[^\w가-힣-]/g,'-').slice(0,40)}-v1.11.0.json`);notify('이미지를 포함한 프로젝트 JSON 백업을 다운로드합니다.');return true;}catch(error){notify(error.message,true);return false;}}
function exportProject(){return exportProjectRecord(project);}
function replaceProject(next){if(!editable())return;if(!confirm('현재 워크플로를 교체할까요? 필요한 내용은 먼저 저장으로 백업하세요.'))return;project=next;selected=next.nodes[0]?.id||null;cancelWire();closeMenus();Object.keys(runStates).forEach(k=>delete runStates[k]);history.length=0;historyRender();changed();readableView();}

async function api(route,input={},anonymous=false,timeout=42000) {
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeout);
  try {
    const response=await fetch(bridge.url+'/api/'+route,{method:'POST',mode:'cors',headers:{'Content-Type':'application/json',...(!anonymous?{Authorization:`Bearer ${bridge.token}`}:{})},body:JSON.stringify(input),signal:controller.signal});
    const data=await response.json();
    if(!response.ok){if(response.status===401){bridge.connected=false;renderConnection();}throw new Error(data.error||'연결 요청에 실패했습니다.');}
    return data;
  } catch(error) {
    if(error.name==='AbortError')throw new Error('연결 응답 시간이 초과됐습니다. 로컬 앱을 확인하세요.');
    if(error instanceof TypeError)throw new Error('로컬 연결 앱에 접속하지 못했습니다. 실행 여부, 허용 웹 주소, 브라우저의 로컬 네트워크 권한을 확인하세요.');
    throw error;
  } finally{clearTimeout(timer);}
}
function rememberToken(){
  try {
    localStorage.removeItem('nodecanvas-bridge');sessionStorage.removeItem('nodecanvas-bridge');
    if(bridge.token)($('remember-bridge').checked?localStorage:sessionStorage).setItem('nodecanvas-bridge',bridge.token);
  }catch{notify('브라우저에서 연결 정보를 저장할 수 없습니다. 현재 탭에서만 연결합니다.');}
}
function renderConnection(){
  $('remember-login').disabled=bridge.loginPending||loginRequestBusy||busy;
  $('login-button').disabled=!bridge.connected||loginRequestBusy||Boolean(bridge.account)||busy;
  $('pc-step-status').textContent=bridge.connected?'✓ PC 연결 완료':'PC 연결 필요';
  $('pc-step-status').classList.toggle('complete',bridge.connected);
  $('account-step-description').textContent=bridge.account?'✓ 계정 로그인까지 완료됐어요. 이 창을 닫고 이미지 작업을 시작하세요.':bridge.loginPending?'아직 로그인 전이에요. 아래 검은 버튼을 눌러 공식 페이지에서 로그인한 뒤 이 작업실로 돌아오세요.':bridge.connected?'PC 연결이 끝났어요. 이제 로그인 시작하기를 누르고 내 ChatGPT 계정을 인증하세요.':'먼저 1번에서 PC를 연결하세요. 연결이 끝나면 로그인할 수 있어요.';
  $('login-button').textContent=bridge.account?'ChatGPT 연결됨':bridge.loginPending?'페이지가 안 열리나요? 링크 다시 받기':'로그인 시작하기';
  $('login-button').classList.toggle('quiet',bridge.loginPending);$('login-button').classList.toggle('primary',!bridge.loginPending);
  $('connector-download').textContent=bridge.connected||connectorPresent?'연결 앱 실행 중':'설치 앱 다운로드 ↗';
  $('launch-connector').textContent=bridge.connected?'PC 다시 연결':'PC 연결하기 ↗';
  $('launch-connector').classList.toggle('primary',!bridge.connected);$('launch-connector').classList.toggle('secondary',bridge.connected);
  updates?.render();
  $('connection-dot').classList.toggle('online',bridge.connected);
  $('connection-label').textContent=bridge.connected?(bridge.account?'ChatGPT 연결됨':'PC 연결됨'):'AI 연결';
}
async function checkConnection(){
  if(!bridge.token)throw new Error('먼저 연결하기를 눌러 PC와 연결하세요.');
  await api('heartbeat',{tabId},false,7000);bridge.connected=true;
  startLease();
  const status=await api('status');bridge.account=status.account;renderConnection();void updates?.refresh();
  const phase=authPhase(status,bridge.loginPending);
  if(phase==='signed-in'){bridge.loginPending=false;$('official-login-link').hidden=$('login-link-note').hidden=true;connectionMessage(`ChatGPT 연결됨${status.account.email?' · '+status.account.email:''}\n${status.account.plan||''} · ${status.storage==='keyring'?'이 PC에 로그인 저장':'종료 시 임시 로그인 해제'}`);}
  else if(phase==='pending')connectionMessage('다음 단계: 검은색 ‘공식 페이지에서 로그인하기’를 눌러 로그인하세요. 완료 후 이 작업실로 돌아오면 자동으로 확인합니다.');
  else{if(phase==='error'){bridge.loginPending=false;$('official-login-link').hidden=$('login-link-note').hidden=true;}connectionMessage(status.error||'1번 PC 연결 완료. 이제 2번 ‘로그인 시작하기’를 누르세요.',Boolean(status.error));}
  renderConnection();
  if(status.storage)$('remember-login').checked=status.storage==='keyring';
  return status;
}
async function heartbeat(){
  if(!bridge.token)return;
  try{await api('heartbeat',{tabId},false,7000);bridge.connected=true;startLease();renderConnection();}catch{bridge.connected=false;bridge.account=null;renderConnection();}
}
function startLease(){
  if(!bridge.token||(leaseController&&leaseToken===bridge.token))return;
  leaseController?.abort();const controller=new AbortController();leaseController=controller;leaseToken=bridge.token;
  void (async()=>{
    try{
      const response=await fetch(bridge.url+'/api/lease',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${leaseToken}`},body:JSON.stringify({tabId}),signal:controller.signal});
      if(!response.ok||!response.body)throw new Error('stream unavailable');
      const reader=response.body.getReader();while(!(await reader.read()).done){}
    }catch{}finally{if(leaseController===controller){leaseController=null;leaseToken='';}}
  })();
}
function timingDetails(timings){
 const labels={preparing:'요청 준비',connected:'연결·계정 확인',requested:'Codex 요청',generating:'이미지 생성 시작',imageReady:'이미지 완성·수신',completed:'Codex 응답 완료'};
 return Object.entries(timings||{}).map(([id,stages])=>`<details><summary>단계별 시간</summary>${stages.map(stage=>`<div>${esc(labels[stage.stage]||stage.stage)} · ${(stage.elapsedMs/1000).toFixed(1)}초</div>`).join('')}</details>`).join('');
}
function historyRender(){
  $('history-count').textContent=history.length;
  $('history-list').innerHTML=history.length?history.map(h=>`<div class="history-row"><span class="${h.state==='completed'?'success':'failed'}">${h.state==='completed'?'✓':'!'}</span><div>${esc(h.label)} · ${esc(h.message)}${timingDetails(h.timings)}</div><small>${new Date(h.time).toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'})}</small></div>`).join(''):'<div class="muted">이 탭에서 실행한 작업이 없습니다.</div>';
}
function setBusy(value){busy=value;updates?.render();updateEditControls();$('run-all').disabled=value;$('cancel-run').hidden=!value;$('open-project').disabled=value;document.querySelectorAll('#add-node,.template').forEach(b=>b.disabled=value);renderNodes();}
async function runWorkflow(target){
  if(busy)return notify('이미 실행 중입니다.');
  let order,snapshot;
  try{snapshot=structuredClone(project);order=executionOrder(snapshot,target);}catch(error){return notify(error.message,true);}
  if(!order.length)return notify('노드를 먼저 추가하세요.');
  const hasAI=order.some(id=>['generate','edit'].includes(snapshot.nodes.find(n=>n.id===id).type));
  if(hasAI&&(!bridge.connected||!bridge.account)){$('connect-dialog').showModal();return connectionMessage('PC 페어링과 ChatGPT 로그인을 먼저 완료하세요.');}
  cancelled=false;setBusy(true);const outputs={};let current;const runStarted=performance.now();let phase='요청 준비 중';
  const elapsedTimer=setInterval(()=>{$('run-status').textContent=`${phase} · ${Math.floor((performance.now()-runStarted)/1000)}초`;},500);
  try {
    for(const id of order) {
      if(cancelled)throw new Error('실행을 취소했습니다.');
      const node=snapshot.nodes.find(n=>n.id===id);current=node;
      const inputs=collectInputs(snapshot,id,outputs);
      runStates[id]={state:'running'};$('run-status').textContent=`${node.data.label||TYPES[node.type].label} 실행 중`;renderNodes();
      if(node.type==='prompt')outputs[id]={text:node.data.text||'',images:[]};
      else if(node.type==='skill')outputs[id]={skills:[node.data.skill]};
      else if(node.type==='image'){
        if(!isImage(node.data.image))throw new Error('참조 이미지 노드에 이미지를 불러오세요.');
        outputs[id]={text:'',images:[node.data.image]};
      } else {
        const userPrompt=[inputs.text,node.data.text].filter(Boolean).join('\n\n');
        const prompt=buildSkillPrompt(node,userPrompt,inputs.images,inputs.skills);
        if(!prompt.trim())throw new Error('프롬프트를 연결하거나 추가 지시사항을 입력하세요.');
        const response=await api('jobs',{prompt,images:inputs.images,kind:node.type==='edit'?'edit':'generate',ratio:node.data.ratio||'1:1'});
        activeJob=response.id;
        while(true){
          if(cancelled)throw new Error('실행을 취소했습니다.');
          const job=await api('job',{id:activeJob});phase=job.message;$('run-status').textContent=`${phase} · ${Math.floor((performance.now()-runStarted)/1000)}초`;
          if(job.images?.[0]){const real=project.nodes.find(n=>n.id===id);if(real&&real.data.image!==job.images[0]){real.data.image=job.images[0];scheduleSave();renderNodes();}}
          if(job.timings?.length){runStates[id].timings=job.timings;}
          if(job.state==='completed'){outputs[id]={text:'',images:job.images};break;}
          if(['failed','cancelled'].includes(job.state))throw new Error(job.message);
          await new Promise(resolve=>setTimeout(resolve,1300));
        }
        activeJob=null;
      }
      if(outputs[id].images?.length){
        const real=project.nodes.find(n=>n.id===id);if(real)real.data.image=outputs[id].images[0];
        snapshot.nodes.find(n=>n.id===id).data.image=outputs[id].images[0];
        scheduleSave();
      }
      runStates[id]={...runStates[id],state:'completed'};renderNodes();
    }
    history.unshift({label:target?'선택 실행':'워크플로',state:'completed',message:`완료 · ${Math.round((performance.now()-runStarted)/1000)}초`,timings:Object.fromEntries(Object.entries(runStates).filter(([id])=>order.includes(id)).map(([id,state])=>[id,state.timings||[]])),time:Date.now()});
    $('run-status').textContent='실행 완료';notify('워크플로 실행을 완료했습니다.');
  } catch(error){
    if(current)runStates[current.id]={state:'failed'};
    history.unshift({label:current?.data.label||'워크플로',state:'failed',message:error.message,time:Date.now()});
    $('run-status').textContent=cancelled?'실행 취소':'실행을 확인해 주세요';notify(error.message,true);
    if(activeJob){await api('cancel',{id:activeJob}).catch(()=>{});activeJob=null;}
  } finally{clearInterval(elapsedTimer);history.splice(30);historyRender();setBusy(false);checkpoint('generation');}
}


function pointerPort(element){const port=element?.closest?.('[data-input],[data-output]');return port?{id:port.dataset.output||port.dataset.input,direction:port.dataset.output?'output':'input',kind:port.dataset.inputKind,element:port}:null;}
function wirePair(a,b){if(!a||!b||a.direction===b.direction)return null;return a.direction==='output'?{from:a.id,to:b.id,inputKind:b.kind}:{from:b.id,to:a.id,inputKind:a.kind};}
function resetHighlight(){document.querySelectorAll('.port.hover-compatible').forEach(el=>el.classList.remove('hover-compatible'));}
$('viewport').addEventListener('pointerdown',event=>{
  if(event.button!==0||event.isPrimary===false)return;
  if(tool==='pan'){closeMenus();drag={kind:'pan',startX:event.clientX,startY:event.clientY,x:view.x,y:view.y,moved:false};$('viewport').setPointerCapture(event.pointerId);event.preventDefault();return;}
  const field=event.target.closest('input,textarea,select');
  if(field){select(field.closest('[data-node]')?.dataset.node);return;}
  const port=pointerPort(event.target);
  if(port){
    if(!editable())return;
    closeMenus();
    const pair=wirePair(pendingPort,port);
    if(pair){tryConnect(pair.from,pair.to,pair.inputKind);suppressClickUntil=performance.now()+200;event.preventDefault();return;}
    pendingPort={id:port.id,direction:port.direction,kind:port.kind};
    drag={kind:'wire',startX:event.clientX,startY:event.clientY,moved:false};
    updatePendingPorts();renderWire(screenToWorld({x:event.clientX,y:event.clientY},$('viewport').getBoundingClientRect(),view));
    $('canvas-hint').textContent='T는 프롬프트 · ▧는 이미지 · 강조된 포트로 연결 · 빈 곳에 놓아 추가 · Esc 취소';
  }else{
    if(event.target.closest('button,[data-edge]')&&!event.target.closest('[data-upload-surface]'))return;
    const nodeElement=event.target.closest('[data-node]');
    if(nodeElement&&!nodeDragAllowed(event.target))return;
    closeMenus();
    if(nodeElement){if(!editable())return;const node=project.nodes.find(n=>n.id===nodeElement.dataset.node);select(node.id);drag={kind:'node',id:node.id,upload:Boolean(event.target.closest('[data-upload-surface]')),startX:event.clientX,startY:event.clientY,x:node.x,y:node.y,moved:false};}
    else if(!event.target.closest('.node')){select(null);drag={kind:'pan',startX:event.clientX,startY:event.clientY,x:view.x,y:view.y,moved:false};}
    else{return;}
  }
  if(drag){$('viewport').setPointerCapture(event.pointerId);event.preventDefault();}
});
$('viewport').addEventListener('pointermove',event=>{
  const rect=$('viewport').getBoundingClientRect(),point=screenToWorld({x:event.clientX,y:event.clientY},rect,view);
  if(!drag){if(pendingPort)renderWire(point);return;}
  const dx=event.clientX-drag.startX,dy=event.clientY-drag.startY;drag.moved ||= Math.hypot(dx,dy)>6;
  if(drag.kind==='node'&&!drag.moved)return;
  if(drag.kind==='wire'){
    renderWire(point);resetHighlight();
    const target=pointerPort(document.elementFromPoint(event.clientX,event.clientY)),pair=wirePair(pendingPort,target);
    if(pair){try{makeConnection(project,pair.from,pair.to,'preview-edge',pair.inputKind);target.element.classList.add('hover-compatible');}catch{}}
  }else if(drag.kind==='pan'){view.x=drag.x+dx;view.y=drag.y+dy;updateView();}
  else{const node=project.nodes.find(n=>n.id===drag.id);if(!node)return;node.x=Math.max(-100000,Math.min(100000,Math.round(drag.x+dx/view.scale)));node.y=Math.max(-100000,Math.min(100000,Math.round(drag.y+dy/view.scale)));const element=document.querySelector(`[data-node="${node.id}"]`);element.style.left=node.x+'px';element.style.top=node.y+'px';renderEdges();}
});
$('viewport').addEventListener('pointerup',event=>{
  const finished=drag;drag=null;
  if($('viewport').hasPointerCapture(event.pointerId))$('viewport').releasePointerCapture(event.pointerId);
  if(!finished)return;
  if(uploadClick(finished)){suppressClickUntil=performance.now()+200;resetHighlight();chooseImage(finished.id);return;}
  if(finished.moved)suppressClickUntil=performance.now()+200;
  if(finished.kind==='node'&&finished.moved){checkpoint();scheduleSave();}
  if(finished.kind==='wire'&&finished.moved){
    const target=pointerPort(document.elementFromPoint(event.clientX,event.clientY)),pair=wirePair(pendingPort,target);
    if(pair){tryConnect(pair.from,pair.to,pair.inputKind);cancelWire();}
    else if(!document.elementFromPoint(event.clientX,event.clientY)?.closest('.node')){
      const origin=pendingPort;cancelWire();openNodeMenu(event.clientX,event.clientY,origin);
    }else{cancelWire();notify('호환되는 입력 포트에 놓아 주세요.');}
  }
  resetHighlight();
});
$('viewport').addEventListener('pointercancel',()=>{if(drag?.kind==='node'&&drag.moved){checkpoint();scheduleSave();}cancelWire();});
$('nodes').addEventListener('input',event=>{
  const input=event.target.closest('[data-field]');if(!input)return;
  const node=project.nodes.find(n=>n.id===input.closest('[data-node]')?.dataset.node);if(!node||busy)return;
  node.data[input.dataset.field]=input.value;delete runStates[node.id];
  const count=input.closest('.node').querySelector('[data-char-count]');if(count)count.textContent=(node.data.text||'').length+'자';
  refreshPromptGuidance();
  checkpoint('field:'+node.id+':'+input.dataset.field);scheduleSave();
});
$('nodes').addEventListener('click',event=>{
  if(performance.now()<suppressClickUntil)return;
  const element=event.target.closest('[data-node]');if(!element)return;const id=element.dataset.node;
  const port=pointerPort(event.target);
  if(port){if(event.detail!==0)return;if(!editable())return;const pair=wirePair(pendingPort,port);if(pair){tryConnect(pair.from,pair.to,pair.inputKind);cancelWire();}else{pendingPort={id:port.id,direction:port.direction,kind:port.kind};updatePendingPorts();$('canvas-hint').textContent='이동할 입력/출력 포트를 Tab으로 선택하고 Enter로 연결하세요';}return;}
  if(event.target.closest('input,textarea,select'))return;
  select(id);
  const sourceId=event.target.closest('[data-prompt-source]')?.dataset.promptSource;if(sourceId){const source=project.nodes.find(n=>n.id===sourceId);if(source){select(source.id);const rect=$('viewport').getBoundingClientRect();view.x=rect.width/2-(source.x+NODE_WIDTH/2)*view.scale;view.y=100-source.y*view.scale;updateView();document.querySelector(`[data-node="${source.id}"] textarea`)?.focus({preventScroll:true});}return;}
  const action=event.target.closest('[data-action]')?.dataset.action;
  if(action==='more'){const rect=event.target.getBoundingClientRect();return openActionMenu(id,rect.right,rect.bottom+5);}
  if(action==='skill-view'){$('hairlock-source').textContent=HAIRLOCK.text;$('hairlock-dialog').showModal();return;}
  if(action==='help')return showNodeHelp(project.nodes.find(n=>n.id===id).type);
  if(action==='upload')return chooseImage(id);
  if(action==='duplicate')return duplicateNode(id);
  if(action==='delete')return deleteNode(id);
  if(event.target.closest('[data-upload-surface]')){if(event.detail===0)return chooseImage(id);return;}
  if(action==='download')return downloadImage(project.nodes.find(n=>n.id===id).data.image);
  if(event.target.closest('[data-run]'))void runWorkflow(id);
});
$('viewport').addEventListener('contextmenu',event=>{
  if(event.target.closest('input,textarea'))return;
  event.preventDefault();cancelWire();
  const node=event.target.closest('[data-node]');
  if(node)openActionMenu(node.dataset.node,event.clientX,event.clientY);else openNodeMenu(event.clientX,event.clientY);
});
$('viewport').addEventListener('dblclick',event=>{if(!event.target.closest('.node,[data-edge]'))openNodeMenu(event.clientX,event.clientY);});
function removeEdge(event){const edge=event.target.closest('[data-edge]');if(edge&&editable()&&confirm('이 노드 연결을 해제할까요?')){project.edges=project.edges.filter(e=>e.id!==edge.dataset.edge);changed();}}
$('edges').onclick=removeEdge;$('edges').onkeydown=event=>{if(['Enter',' '].includes(event.key)){event.preventDefault();removeEdge(event);}};
$('viewport').addEventListener('wheel',event=>{
  if(event.target.closest('textarea,select'))return;
  event.preventDefault();if(drag)return;
  const rect=$('viewport').getBoundingClientRect();zoom(Math.exp(-event.deltaY*.0012),event.clientX-rect.left,event.clientY-rect.top);
},{passive:false});
$('add-node').onclick=()=>{const rect=$('viewport').getBoundingClientRect();openNodeMenu(rect.left+Math.min(220,rect.width/2),rect.top+100);};
$('node-search').oninput=renderMenu;
$('menu-tabs').onclick=event=>{const button=event.target.closest('[data-category]');if(button){menuCategory=button.dataset.category;renderMenu();}};
function setTool(next){cancelWire();tool=next;$('viewport').classList.toggle('pan-mode',tool==='pan');$('select-tool').setAttribute('aria-pressed',String(tool==='select'));$('pan-tool').setAttribute('aria-pressed',String(tool==='pan'));}
$('select-tool').onclick=()=>setTool('select');$('pan-tool').onclick=()=>setTool('pan');
$('menu-items').onclick=event=>{const button=event.target.closest('[data-add]');if(button)addNode(button.dataset.add);};
$('node-menu').onkeydown=event=>{
  if(isImeKey(event))return;
  const buttons=[...$('menu-items').querySelectorAll('button')],index=buttons.indexOf(document.activeElement);
  if(event.key==='ArrowDown'){event.preventDefault();buttons[(index+1)%buttons.length]?.focus();}
  if(event.key==='ArrowUp'){event.preventDefault();buttons[(index-1+buttons.length)%buttons.length]?.focus();}
  if(event.key==='Enter'&&event.target===$('node-search')){event.preventDefault();buttons[0]?.click();}
};
$('menu-close').onclick=()=>closeMenus(true);
$('duplicate-node').onclick=()=>duplicateNode(actionTarget);$('delete-node').onclick=()=>deleteNode(actionTarget);
$('action-menu').onkeydown=event=>{if(event.key==='ArrowDown'){event.preventDefault();$('delete-node').focus();}if(event.key==='ArrowUp'){event.preventDefault();$('duplicate-node').focus();}};
$('templates-open').onclick=()=>{
  const wasOpen=!$('template-menu').hidden;closeMenus();if(wasOpen)return;
  const rect=$('templates-open').getBoundingClientRect();$('template-menu').hidden=false;
  const pos=menuPosition({x:rect.left,y:rect.bottom+8},{width:innerWidth,height:innerHeight},$('template-menu').getBoundingClientRect());$('template-menu').style.left=pos.x+'px';$('template-menu').style.top=pos.y+'px';$('template-basic').focus();
};
document.addEventListener('pointerdown',event=>{const active=document.activeElement;if(active?.matches('input,textarea,select,[contenteditable="true"]')&&active!==event.target&&!active.contains(event.target))active.blur();},true);
document.addEventListener('pointerdown',event=>{if(!event.target.closest('#node-menu,#action-menu,#template-menu,#add-node,#templates-open,.port'))closeMenus();});
$('zoom-in').onclick=()=>zoom(1.15);$('zoom-out').onclick=()=>zoom(1/1.15);$('zoom-reset').onclick=()=>zoom(1/view.scale);$('fit-view').onclick=fitView;
$('project-name').oninput=event=>{if(!editable()){event.target.value=project.name;return;}project.name=event.target.value;checkpoint('project-name');scheduleSave();};
$('export-project').onclick=exportProject;
$('open-project').onclick=()=>{if(editable()){$('project-file').value='';$('project-file').click();}};
$('project-file').onchange=async event=>{const file=event.target.files[0];if(!file)return;try{if(file.size>MAX_PROJECT_BYTES)throw new Error('프로젝트 JSON은 200MB까지 열 수 있습니다.');await library.importProject(restoreProject(await file.text()));}catch(error){notify(error.message,true);}};
$('image-file').onchange=async event=>{
  const file=event.target.files[0],id=uploadTarget,ticket={projectId:activeSpaceId,session:projectSession,nodeId:uploadTarget};if(!file||!editable())return;
  if(file.size>8_000_000)return notify('이미지는 8MB 이하로 불러오세요.',true);
  if(!['image/png','image/jpeg','image/webp'].includes(file.type))return notify('PNG/JPG/WebP 이미지만 사용할 수 있습니다.',true);
  try{const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('이미지 읽기 실패'));reader.readAsDataURL(file);});const bitmap=await createImageBitmap(file);bitmap.close();if(!uploadApplies(ticket,{projectId:activeSpaceId,session:projectSession,project}))return notify('프로젝트가 바뀌어 이미지 적용을 중단했습니다. 필요한 프로젝트에서 다시 선택해 주세요.');const node=project.nodes.find(n=>n.id===id);if(!node)return;node.data.image=data;selected=id;changed();notify('이미지를 불러왔습니다.');}catch{notify('이미지를 읽지 못했습니다. 실제 이미지 파일인지 확인하세요.',true);}
};
$('template-basic').onclick=()=>replaceProject(starterProject());
$('template-edit').onclick=()=>replaceProject(editProject());
$('help-open').onclick=()=>$('help-dialog').showModal();
$('connect-open').onclick=()=>{$('connect-dialog').showModal();if(bridge.token)void checkConnection().catch(error=>connectionMessage(error.message,true));void detectConnector();};
$('pair-button').onclick=async()=>{
  $('pair-button').disabled=true;
  try{const result=await api('pair',{code:$('pair-code').value.trim().toLowerCase(),tabId},true,8000);bridge.token=result.token;bridge.connected=true;rememberToken();$('pair-code').value='';renderConnection();await checkConnection();}catch(error){connectionMessage(error.message,true);}finally{$('pair-button').disabled=false;}
};
$('pair-code').onkeydown=event=>{if(event.key==='Enter'){event.preventDefault();$('pair-button').click();}};
$('remember-bridge').onchange=rememberToken;
$('check-connection').onclick=async()=>{try{await checkConnection();}catch(error){connectionMessage(error.message,true);}};
$('login-button').onclick=async()=>{
 if(!bridge.connected)return connectionMessage('먼저 연결하기를 눌러 PC와 연결하세요.',true);
 if(loginRequestBusy)return;const attempt=++authAttempt;loginRequestBusy=true;bridge.loginPending=false;$('official-login-link').hidden=$('login-link-note').hidden=true;renderConnection();connectionMessage('공식 로그인 링크를 준비하고 있습니다…');
 try{const result=await api('login',{remember:$('remember-login').checked});
  if(result.alreadyLoggedIn){bridge.loginPending=false;await checkConnection();}
  else{if(!officialLoginUrl(result.authUrl))throw new Error('공식 로그인 주소를 확인하지 못했습니다.');bridge.loginPending=true;$('official-login-link').href=result.authUrl;$('official-login-link').hidden=$('login-link-note').hidden=false;$('login-button').textContent='페이지가 안 열리나요? 링크 다시 받기';$('login-button').classList.remove('primary');$('login-button').classList.add('quiet');connectionMessage('다음 단계: 검은색 ‘공식 페이지에서 로그인하기’를 눌러 로그인하세요. 완료 후 이 작업실로 돌아오세요.');renderConnection();void pollLogin(attempt);}
 }catch(error){bridge.loginPending=false;connectionMessage(error.message,true);renderConnection();}finally{loginRequestBusy=false;renderConnection();}
};
$('logout-button').onclick=async()=>{if(!confirm('NodeCanvas 앱 전용 ChatGPT 계정에서 로그아웃할까요?'))return;try{await api('logout');bridge.account=null;renderConnection();connectionMessage('앱 전용 계정에서 로그아웃했습니다.');}catch(error){connectionMessage(error.message,true);}};
$('run-all').onclick=()=>runWorkflow();
$('cancel-run').onclick=async()=>{cancelled=true;$('cancel-run').disabled=true;try{if(activeJob)await api('cancel',{id:activeJob});}catch(error){notify(error.message,true);}finally{$('cancel-run').disabled=false;}};
$('history-toggle').onclick=()=>{$('history-list').hidden=!$('history-list').hidden;};
document.addEventListener('keydown',event=>{
  if(isImeKey(event))return;
  if(document.body.classList.contains('show-library'))return;
  if((event.ctrlKey||event.metaKey)&&['z','y'].includes(event.key.toLowerCase())&&!event.target.closest('input,textarea,select')&&!document.querySelector('dialog[open]')){event.preventDefault();undoEdit(event.shiftKey||event.key.toLowerCase()==='y');return;}
  if(event.key==='Escape'){cancelWire();closeMenus();$('canvas-hint').textContent='우클릭으로 추가 · 포트를 끌어 연결 · 노드 안에서 바로 입력';return;}
  if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='s'){event.preventDefault();exportProject();}
  if(['INPUT','TEXTAREA','SELECT'].includes(event.target.tagName)||document.querySelector('dialog[open]'))return;
  if(event.key.toLowerCase()==='v')setTool('select');
  if(event.key.toLowerCase()==='h')setTool('pan');
  if(event.key==='Delete'&&selected)deleteNode(selected);
  if(event.code==='Space'&&!event.target.closest('button,#node-menu,#action-menu,#template-menu')){event.preventDefault();const rect=$('viewport').getBoundingClientRect();openNodeMenu(rect.left+rect.width/2,rect.top+150);}
  if(event.key==='ContextMenu'||(event.shiftKey&&event.key==='F10')){event.preventDefault();const rect=$('viewport').getBoundingClientRect();openNodeMenu(rect.left+rect.width/2,rect.top+150);}
});
document.addEventListener('visibilitychange',()=>{if(!document.hidden)void heartbeat();});
window.addEventListener('resize',()=>closeMenus());
renderAll();historyRender();readableView();
try{library=await initializeLibrary({beforeLeave:leaveProject,afterTransition:()=>{document.querySelector('.app-header').inert=false;document.querySelector('.workspace').inert=false;},openProject:enterProject,onLibrary:releaseProject,backupProject:exportProjectRecord,notify});}catch(error){notify(error.message,true);$('spaces-grid').setAttribute('aria-busy','false');$('spaces-grid').textContent='프로젝트를 불러오지 못했습니다. 저장소 권한을 확인하고 새로고침해 주세요.';$('new-space').disabled=true;}
$('spaces-home').onclick=()=>void library?.show().catch(error=>notify(error.message,true));
for(const brand of document.querySelectorAll('.brand'))brand.onclick=event=>{event.preventDefault();void library?.show().catch(error=>notify(error.message,true));};
$('import-space').onclick=()=>{$('project-file').value='';$('project-file').click();};
window.addEventListener('pagehide',()=>{clearTimeout(saveTimer);void persistCurrent().catch(()=>{});});
try{const local=localStorage.getItem('nodecanvas-bridge');bridge.token=local||sessionStorage.getItem('nodecanvas-bridge')||'';$('remember-bridge').checked=Boolean(local);}catch{}
if(bridge.token)void checkConnection().catch(()=>{bridge.connected=false;renderConnection();});
setInterval(()=>void heartbeat(),15000);

let launchAttempt=0;
$('launch-connector').onclick=async()=>{
 const attempt=++launchAttempt,button=$('launch-connector');button.disabled=true;
 try{
  if(!window.isSecureContext)throw new Error('HTTPS 주소에서 연결해 주세요.');
  const secret=Array.from(crypto.getRandomValues(new Uint8Array(32)),x=>x.toString(16).padStart(2,'0')).join('');
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(secret));
  const challenge=Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,'0')).join('');
  const uri=`nodecanvas://connect?origin=${encodeURIComponent(location.origin)}&challenge=${challenge}`;
  const link=document.createElement('a');link.href=uri;link.click();
  connectionMessage('연결 앱을 열고 있습니다. 앱에서 이 웹 주소를 확인해 주세요.');
  const end=Date.now()+90000;
  while(Date.now()<end&&attempt===launchAttempt){
   await new Promise(r=>setTimeout(r,1500));
   try{const result=await api('claim',{secret,tabId},true,2500);bridge.token=result.token;bridge.connected=true;rememberToken();renderConnection();await checkConnection();return;}catch{}
  }
  connectionMessage('연결을 기다리는 시간이 지났어요. 앱 설치를 확인하고 연결하기를 다시 눌러 주세요.',true);
 }catch(error){connectionMessage(error.message,true);}finally{if(attempt===launchAttempt)button.disabled=false;}
};
async function pollLogin(attempt){
 const end=Date.now()+600000;
 while(Date.now()<end&&attempt===authAttempt&&bridge.connected&&bridge.loginPending&&!bridge.account){await new Promise(r=>setTimeout(r,2500));if(attempt!==authAttempt)return;try{await checkConnection();}catch{}}
 if(attempt===authAttempt&&bridge.loginPending&&!bridge.account){bridge.loginPending=false;$('official-login-link').hidden=$('login-link-note').hidden=true;renderConnection();connectionMessage('아직 로그인 완료를 확인하지 못했습니다. 공식 페이지에서 로그인한 뒤 상태 다시 확인을 누르거나 링크를 새로 받아 주세요.',true);}
}

async function detectConnector(){
 connectorPresent=false;
 if(bridge.token){try{await api('heartbeat',{tabId},false,1500);connectorPresent=true;}catch{}}
 if(!connectorPresent){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),1500);try{const r=await fetch(bridge.url+'/api/presence',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}',signal:controller.signal});const data=await r.json();connectorPresent=r.ok&&data.app==='NodeCanvas'&&/^\d+\.\d+\.\d+$/.test(data.version);}catch{}finally{clearTimeout(timer);}}
 renderConnection();return connectorPresent;
}
$('connector-download').onclick=async event=>{event.preventDefault();const link=$('connector-download');if(link.dataset.checking)return;link.dataset.checking='true';try{if(await detectConnector()){connectionMessage('연결 앱이 이미 실행 중입니다. 재설치 없이 연결하기를 눌러 주세요.');$('launch-connector').focus();return;}const download=document.createElement('a');download.href=link.href;download.download='';download.click();connectionMessage('다운로드한 설치 앱을 실행해 주세요. 기존 설치가 있으면 같은 폴더를 사용하고 중복 설치하지 않습니다.');}finally{delete link.dataset.checking;}};

$('undo-edit').onclick=()=>undoEdit();$('redo-edit').onclick=()=>undoEdit(true);
$('retry-save').onclick=async()=>{$('retry-save').disabled=true;try{await persistCurrent();notify('프로젝트를 다시 저장했습니다.');}catch(error){notify(error.message,true);}finally{$('retry-save').disabled=false;}};
window.addEventListener('beforeunload',event=>{if(dirty||busy){event.preventDefault();event.returnValue='';}});

updates=initializeUpdates({api,connected:()=>bridge.connected,busy:()=>busy||loginRequestBusy||bridge.loginPending,notify,
 beforeApply:async()=>{await persistCurrent();setBusy(true);renderConnection();},
 afterApply:()=>{setBusy(false);renderConnection();},
 reconnect:async secret=>{
  leaseController?.abort();bridge.token='';bridge.connected=false;bridge.account=null;rememberToken();renderConnection();
  const end=Date.now()+90000;
  while(Date.now()<end){await new Promise(r=>setTimeout(r,1500));try{const result=await api('claim',{secret,tabId},true,2000);bridge.token=result.token;bridge.connected=true;rememberToken();await checkConnection();return result.version;}catch{}}
  throw new Error('재연결을 완료하지 못했습니다.');
 }
});


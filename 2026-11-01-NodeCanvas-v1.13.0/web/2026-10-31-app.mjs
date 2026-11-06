import {bindMentionPrompt,moveMentions,cleanMentions,mentionCandidates,mentionTitle,exactMention} from './2026-11-03-image-mentions.mjs';
import {colorSettings} from './2026-11-03-color.mjs';
import {renderColorPanel, loadColorPanel, refreshColorPanel, colorPng} from './2026-11-03-color-panel.mjs';
import {ensureNodeNumbers,assignNodeNumber,nodeLabel,mergeNodeCounters} from './2026-11-01-node-numbers.mjs';
import {readImageFile,imageGrid} from './2026-11-01-image-import.mjs';
import {TaskQueue} from './2026-11-01-task-queue.mjs';
import {executionPlan,requestForNode} from './2026-11-01-execution.mjs';
import {nodeIcon,portIcon} from './2026-11-01-icons.mjs';
import {getSkill,createSkillNodeData} from './2026-11-01-skills.mjs';
import {initializeUpdates} from './2026-11-01-updates.mjs';
import {TYPES,outputKind,canConnect,validateGraph,executionOrder,collectInputs,restoreProject,normalizeProject,projectJSON,projectBytes,MAX_PROJECT_BYTES,MAX_NODE_COUNT,starterProject,editProject,isImage} from './2026-10-31-graph.mjs';
import {CATALOG,menuEntries,NODE_HELP,authPhase,officialLoginUrl,filterCatalog,requiresMedia} from './2026-10-31-catalog.mjs';
import {projectUsage,usageNotice} from './2026-11-01-usage.mjs';
import {promptPresentation} from './2026-11-01-node-layout.mjs';
import {uploadApplies} from './2026-10-31-assets.mjs';
import {EditHistory} from './2026-10-31-history.mjs';
import {getSpace,saveProject} from './2026-10-31-storage.mjs';
import {settleEdits} from './2026-10-31-spaces.mjs';
import {initializeLibrary} from './2026-10-31-library.mjs';
import {IMAGE_NODE_WIDTH,nodeWidth,nodeDragAllowed,uploadClick,PORT_Y,portsFor,portOffset,screenToWorld,curvePath,makeConnection,compatibleTypes,menuPosition,isImeKey} from './2026-10-31-canvas.mjs';

const $=id=>document.getElementById(id);
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uuid=()=>crypto.randomUUID();
const descriptions={prompt:'장면과 스타일을 글로',image:'내 이미지에서 시작하기',generate:'상상한 장면을 이미지로',edit:'이미지를 원하는 모습으로'};
const tints={color:'#c3faf5',skill:'#fff0da',prompt:'#e8edff',image:'#fde0f0',generate:'#fff4c4',edit:'#c3faf5'};
let projectSession=0;
let activeSpaceId=null,library=null,dirty=false,saveRevision=0,saveQueue=Promise.resolve();
let project=starterProject(),selected='generate-start',pendingPort=null,drag=null;
let view={x:0,y:0,scale:1},saveTimer,toastTimer,busy=false,uploadTarget=null;
let menuContext=null,actionTarget=null,suppressClickUntil=0,menuCategory='all',tool='select';
const selectedIds=new Set(['generate-start']);let spaceHeld=false;
const marquee=document.createElement('div');marquee.className='selection-box';marquee.hidden=true;$('viewport').append(marquee);
let runStates={};const stateByProject=new Map(),history=[];let applyingUpdate=false,transitioning=false,transitionRelease=null,workspaceTail=Promise.resolve();
const taskQueue=new TaskQueue({execute:executeTask,cancel:cancelProviderTask,onChange:taskChanged});
const bridge={url:'http://127.0.0.1:7330',token:'',connected:false,account:null,loginPending:false};
let updates=null;
let leaseController=null,leaseToken='',connectorPresent=false;
let authAttempt=0,loginRequestBusy=false;
const tabId=uuid(),editHistory=new EditHistory(),spaceRevisions=new Map();

function notify(message,error=false){$('toast').textContent=message;$('toast').classList.toggle('error',error);$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,error?7500:4200);}
let usageFrame=0;
function scheduleUsage(){if(usageFrame)return;usageFrame=requestAnimationFrame(()=>{usageFrame=0;const metrics=projectUsage(project),notice=usageNotice(metrics);$('project-usage-metrics').innerHTML=metrics.map(m=>`<span class="usage-metric ${m.level}" data-usage="${m.key}">${m.display}</span>`).join('');$('project-usage').dataset.severity=notice.severity;const warning=$('project-usage-warning');if(warning.textContent!==notice.text)warning.textContent=notice.text;warning.hidden=!notice.text;});}
function connectionMessage(message,error=false){$('connection-message').textContent=message;$('connection-message').classList.toggle('error',error);}
function nodeLocked(id){return applyingUpdate||Boolean(id&&taskQueue.locked(activeSpaceId,id));}
function editable(id){if(applyingUpdate){notify('연결 앱 업데이트가 끝난 뒤 수정하세요.');return false;}if(nodeLocked(id)){notify('이 노드는 실행·대기 중인 작업에서 사용하고 있습니다. 다른 노드를 편집하거나 작업을 취소하세요.');return false;}return true;}
function projectEditable(){if(taskQueue.hasProject(activeSpaceId)){notify('이 프로젝트의 작업을 완료하거나 취소한 뒤 실행 취소·템플릿 교체를 사용하세요.');return false;}return editable();}
async function acquireWorkspace(){const previous=workspaceTail;let release;workspaceTail=new Promise(resolve=>{release=resolve;});await previous;return release;}
function endTransition(){transitioning=false;const release=transitionRelease;transitionRelease=null;release?.();document.querySelector('.app-header').inert=false;document.querySelector('.workspace').inert=false;}
function scheduleSave(){
 scheduleUsage();
 if(!activeSpaceId)return;dirty=true;saveRevision++;$('save-state').dataset.state='saving';$('save-state').textContent='저장 중…';clearTimeout(saveTimer);saveTimer=setTimeout(()=>void persistCurrent().catch(error=>{notify(error.message,true);}),400);
}
async function persistCurrent(){
 
 if(!activeSpaceId||!dirty)return saveQueue;
 let snapshot;try{snapshot=normalizeProject(project);}catch(error){$('save-state').dataset.state='error';$('save-state').textContent='저장 실패';$('retry-save').hidden=false;throw error;}
 const id=activeSpaceId,revision=saveRevision;
 saveQueue=saveQueue.catch(()=>{}).then(()=>saveProject(snapshot,id,{expectedRevision:spaceRevisions.get(id)})).then(record=>{spaceRevisions.set(id,record.revision);if(id===activeSpaceId&&revision===saveRevision){dirty=false;$('save-state').dataset.state='saved';$('save-state').textContent='자동 저장됨';$('retry-save').hidden=true;}}).catch(error=>{$('save-state').dataset.state='error';$('save-state').textContent='저장 실패';$('retry-save').hidden=false;throw error;});return saveQueue;
}
async function leaveProject(){if(applyingUpdate)throw new Error('연결 앱 업데이트가 끝난 뒤 프로젝트를 전환하세요.');if(!transitioning){transitionRelease=await acquireWorkspace();transitioning=true;}document.querySelector('.app-header').inert=true;document.querySelector('.workspace').inert=true;clearTimeout(saveTimer);await settleEdits(()=>dirty,persistCurrent);cancelWire();closeMenus();}
function enterProject(record){const next=normalizeProject(record.project,{allowOversized:true}),numbered=ensureNodeNumbers(next);projectSession++;activeSpaceId=record.id;spaceRevisions.set(record.id,record.revision);project=next;dirty=false;selected=null;selectedIds.clear();editHistory.reset(project);runStates=stateByProject.get(record.id)||{};stateByProject.set(record.id,runStates);historyRender();renderAll();readableView();$('retry-save').hidden=true;$('save-state').dataset.state='saved';$('save-state').textContent='자동 저장됨';if(projectBytes(project)>MAX_PROJECT_BYTES)notify('이전 저장본이 200MB를 넘습니다. 이미지를 개별 저장하고 노드를 줄이면 다시 저장할 수 있어요.',true);else if(numbered)scheduleSave();}
function releaseProject(){projectSession++;activeSpaceId=null;project={version:'1.0.0',name:'',nodes:[],edges:[]};dirty=false;selected=null;selectedIds.clear();editHistory.reset(project);runStates={};historyRender();$('image-file').value='';renderAll();}
function updateEditControls(){$('undo-edit').disabled=applyingUpdate||taskQueue.hasProject(activeSpaceId)||!editHistory.canUndo;$('redo-edit').disabled=applyingUpdate||taskQueue.hasProject(activeSpaceId)||!editHistory.canRedo;}
function checkpoint(group=null){editHistory.record(project,group);updateEditControls();}
function undoEdit(redo=false){if(!projectEditable())return;const next=redo?editHistory.redo():editHistory.undo();if(!next)return;mergeNodeCounters(next,project);project=next;selected=null;selectedIds.clear();cancelWire();closeMenus();renderAll();scheduleSave();}
function updateView(){
  $('world').style.transform=`translate(${view.x}px,${view.y}px) scale(${view.scale})`;
  $('zoom-label').textContent=Math.round(view.scale*100)+'%';
  $('viewport').style.backgroundSize=`${24*view.scale}px ${24*view.scale}px`;
  $('viewport').style.backgroundPosition=`${view.x}px ${view.y}px`;
}
function fitView(){
  if(!project.nodes.length){view={x:0,y:0,scale:1};return updateView();}
  const minX=Math.min(...project.nodes.map(n=>n.x)),minY=Math.min(...project.nodes.map(n=>n.y));
  const maxX=Math.max(...project.nodes.map(n=>n.x+nodeWidth(n.type)));
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
function portPoint(id,direction,kind){const n=project.nodes.find(n=>n.id===id);return {x:n.x+(direction==='output'?nodeWidth(n.type):0),y:n.y+(Number.parseFloat(document.querySelector(`[data-node="${id}"] .port.${direction}${kind?'.port-'+kind:''}`)?.style.getPropertyValue('--port-y'))||portOffset(n.type,direction,kind))};}
const edgePaths=new Map();
function edgePath(source,target){
  return curvePath(portPoint(source.id,'output'),portPoint(target.id,'input',outputKind(source.type)));
}
function renderEdges(){
  $('edges').innerHTML=project.edges.map(edge=>{
    const source=project.nodes.find(n=>n.id===edge.from),target=project.nodes.find(n=>n.id===edge.to);if(!source||!target)return '';
    const d=edgePath(source,target);
    return `<g class="edge-group" data-edge="${esc(edge.id)}" style="--edge-color:${source.type==='skill'?'#a36b26':TYPES[source.type].output==='text'?'#4262ff':'#79609e'}" role="button" tabindex="0" aria-label="${esc(nodeLabel(source,TYPES[source.type].label))}에서 ${esc(nodeLabel(target,TYPES[target.type].label))} 연결 해제"><path class="edge-hit" d="${d}"/><path class="edge" d="${d}"/></g>`;
  }).join('');
  edgePaths.clear();
  for(const group of $('edges').children)edgePaths.set(group.dataset.edge,[...group.children]);
}
function moveEdgePaths(movingIds){
  for(const edge of project.edges){
    if(!movingIds.has(edge.from)&&!movingIds.has(edge.to))continue;
    const paths=edgePaths.get(edge.id);
    if(!paths)continue;
    const source=project.nodes.find(node=>node.id===edge.from),target=project.nodes.find(node=>node.id===edge.to);
    if(!source||!target)continue;
    const d=edgePath(source,target);
    for(const path of paths)path.setAttribute('d',d);
  }
}
function renderWire(point){
  if(!pendingPort||!point){$('wire-preview').innerHTML='';return;}
  const origin=portPoint(pendingPort.id,pendingPort.direction,pendingPort.kind);
  const d=pendingPort.direction==='output'?curvePath(origin,point):curvePath(point,origin);
  $('wire-preview').innerHTML=`<path class="wire" d="${d}"/>`;
}
function displayedImage(node){return node?(runStates[node.id]?.previewImage||node.data.image):'';}
function progressMarkup(node){const state=runStates[node.id];if(!['queued','running','cancelling','failed','cancelled'].includes(state?.state))return '';const running=['running','cancelling'].includes(state.state),waiting=state.state==='queued';const label=state.state==='cancelling'?'취소 요청 중':waiting?'생성 대기 중':state.state==='failed'?'생성을 완료하지 못했어요':state.state==='cancelled'?'생성이 취소됐어요':'작업 중';return `<div class="node-progress ${running?'is-running':waiting?'is-waiting':'is-error'}" role="status"><div class="progress-content"><span class="progress-symbol" aria-hidden="true">${running?'':waiting?'◷':'!'}</span><strong class="progress-title">${esc(label)}</strong><span class="progress-detail">${waiting?'앞선 작업이 끝나면 시작합니다':state.state==='failed'?'작업 목록에서 오류를 확인하세요':state.state==='cancelled'?'지시를 확인한 뒤 다시 생성할 수 있어요':'다른 작업을 준비해도 괜찮아요'}</span>${state.startedAt&&running?`<span class="progress-elapsed" aria-live="off" data-start="${state.startedAt}">${Math.floor((Date.now()-state.startedAt)/1000)}초 경과</span>`:''}</div></div>`;}
function preview(node,kind='generate'){
  const progress=progressMarkup(node);if(progress){const displayImage=runStates[node.id]?.previewImage||node.data.image;const image=isImage(displayImage)?`<img class="node-preview" src="${displayImage}" alt="${runStates[node.id]?.previewImage?'수신한 생성 이미지':'이전 생성 이미지'}" draggable="false">`:'<div class="image-placeholder media-empty"></div>';return `<div class="node-media-stage ${isImage(displayImage)?'has-image':''}">${image}${progress}</div>`;}

  if(isImage(node.data.image)){const img=`<img class="node-preview" src="${node.data.image}" alt="${esc(TYPES[node.type].label)} 이미지" draggable="false">`;return node.type==='image'?`<div class="upload-surface" data-upload-surface role="button" tabindex="0" aria-label="업로드 이미지 바꾸기">${img}</div>`:img;}
  if(kind==='image')return '<button type="button" class="image-placeholder upload-node" data-upload-surface aria-label="이미지 파일 선택"><span class="placeholder-symbol">↥</span><strong>이미지 업로드</strong><span>파일을 선택해 시작하세요</span></button>';
  return `<div class="image-placeholder media-empty"><span class="placeholder-symbol">✦</span><span>이미지 미리보기</span></div>`;
}
function promptSources(info){return info.sources.length?`<div class="prompt-source-status">연결된 텍스트 사용 중${info.sources.map(source=>`<button type="button" data-prompt-source="${esc(source.id)}" title="원본 텍스트 편집">${esc(source.label)}${source.empty?' · 내용 없음':''} ↗</button>`).join('')}</div>`:'';}
function field(n,label,short=false){const info=short?promptPresentation(project,n):{label,placeholder:'원하는 장면이나 재사용할 지시문을 입력하세요…',sources:[]};return `${short?`<div class="prompt-sources" data-sources-for="${esc(n.id)}">${promptSources(info)}</div>`:''}<label class="node-field ${short?'inline-prompt':''}">${short?'':`<span class="field-label">${esc(info.label)}</span>`}<textarea class="node-text ${short?'short':''}" data-field="text" aria-label="${esc(TYPES[n.type].label)} ${esc(info.label)}" maxlength="16000" ${nodeLocked(n.id)?'disabled':''} placeholder="${esc(hasSkill(n)?skillHint(n):info.placeholder)}">${esc(n.data.text||'')}</textarea></label>`;}
function nodeSkill(node){const source=project.edges.filter(e=>e.to===node.id).map(e=>project.nodes.find(n=>n.id===e.from)).find(n=>n?.type==='skill');return getSkill(source?.data.skill);}
function skillHint(node){return nodeSkill(node)?.promptHint||'예: 얼굴과 배경은 유지하고 앞머리가 있는 단발로 바꿔 주세요…';}
function nodeRatio(node){return nodeSkill(node)?.ratio||node.data.ratio||'1:1';}
function hasSkill(node){return project.edges.some(e=>e.to===node.id&&project.nodes.find(n=>n.id===e.from)?.type==='skill');}
function refreshPromptGuidance(){for(const node of project.nodes.filter(n=>['generate','edit'].includes(n.type))){const el=document.querySelector(`[data-node="${node.id}"]`);if(!el)continue;const info=promptPresentation(project,node),input=el.querySelector('textarea');el.querySelector('.prompt-sources').innerHTML=promptSources(info);input.placeholder=hasSkill(node)?skillHint(node):info.placeholder;input.setAttribute('aria-label',TYPES[node.type].label+' '+info.label);}}
const mediaObserver=new ResizeObserver(entries=>{for(const entry of entries){const el=entry.target.closest('[data-node]');if(!el)continue;const node=project.nodes.find(n=>n.id===el.dataset.node);if(!node)continue;const inputs=portsFor(node.type).filter(p=>p.direction==='input'),center=Math.max(inputs.length===3?48:0,entry.target.offsetHeight/2),spread=32;for(const port of el.querySelectorAll('.port')){const index=inputs.findIndex(p=>p.kind===port.dataset.inputKind),offset=inputs.length===3?(index-1)*spread:port.dataset.inputKind==='prompt'?-spread:spread;port.style.setProperty('--port-y',(port.classList.contains('input')?center+offset:center)+'px');}}renderEdges();});
function observeMedia(){refreshMentionHighlights();mediaObserver.disconnect();document.querySelectorAll('.node-content > .node-preview,.prompt-card-media,.upload-surface').forEach(el=>mediaObserver.observe(el));}
function renderPorts(node){return portsFor(node.type).map(port=>`<button type="button" class="port ${port.direction} port-${port.kind}" style="--port-y:${portOffset(node.type,port.direction,port.kind)}px" data-${port.direction}="${esc(node.id)}" data-input-kind="${port.kind}" aria-label="${esc(TYPES[node.type].label)} ${port.label} ${port.direction==='input'?'입력':'출력'} 연결" title="${port.label} · ${port.description}"><span class="port-icon" aria-hidden="true">${portIcon(port.kind)}</span><span class="port-caption" aria-hidden="true">${port.label}</span><span class="port-description" aria-hidden="true">${port.description}</span></button>`).join('');}
function renderNodeTools(node){const type=TYPES[node.type];return `<div class="node-tools" role="group" aria-label="${esc(type.label)} 빠른 도구">${type.output==='image'?`<button type="button" data-action="download" aria-label="${esc(type.label)} 이미지 저장" title="이미지 저장 · AI를 다시 실행하지 않습니다" ${!isImage(displayedImage(node))?'disabled':''}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M12 3v12m-5-5 5 5 5-5M5 16v4h14v-4"/></svg><span class="tool-tip">이미지 저장</span></button>`:''}<button type="button" data-action="duplicate" aria-label="${esc(type.label)} 노드 복제" title="노드 복제" ${nodeLocked(node.id)?'disabled':''}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V4H4v12h4"/></svg><span class="tool-tip">복제</span></button><button type="button" data-action="delete" aria-label="${esc(type.label)} 노드 삭제" title="노드 삭제" ${nodeLocked(node.id)?'disabled':''}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7"/></svg><span class="tool-tip">삭제</span></button></div>`;}
function colorSource(node) {
  const edge = project.edges.find(edge => edge.to === node.id);
  const image = project.nodes.find(source => source.id === edge?.from && ['generate','edit'].includes(source.type))?.data.image;
  return isImage(image) ? image : '';
}
function renderNodeMarkup(n,index=0){
    const type=TYPES[n.type],state=runStates[n.id],media=requiresMedia(n.type);let content='';
    if(n.type==='skill')content=`<div class="skill-card-body"><p>${esc(getSkill(n.data.skill)?.description||'선택한 이미지 제작 지침')}</p></div>`;
    if(n.type==='prompt')content=`${field(n,'프롬프트')}<div class="text-footer"><span data-char-count>${(n.data.text||'').length}자</span><span>텍스트</span></div>`;
    if(n.type==='image')content=preview(n,'image')+(n.data.image?'<div class="node-settings"><button class="button quiet" data-action="upload">이미지 바꾸기</button><button class="button quiet" data-action="download">저장 ↗</button></div>':'');
    if(['generate','edit'].includes(n.type))content=`<div class="prompt-card-media" data-ratio="${esc(nodeRatio(n))}">${preview(n,n.type==='generate'?'generate':'edit')}<div class="card-prompt-overlay">${field(n,n.type==='edit'?'편집 지시':'프롬프트',true)}<div class="node-settings"><label class="ratio-control"><span class="field-label">비율</span><select data-field="ratio" aria-label="${esc(type.label)} 이미지 비율" ${nodeLocked(n.id)||Boolean(nodeSkill(n)?.ratio)?'disabled':''} title="${nodeSkill(n)?.ratio?'선택한 스킬의 가로형 비율을 사용합니다.':'이미지 비율'}">${['1:1','3:2','2:3','16:9','9:16'].map(r=>`<option ${r===nodeRatio(n)?'selected':''}>${r}</option>`).join('')}</select></label><button class="button primary node-run" type="button" aria-label="${n.type==='edit'?'편집하기':'생성하기'}" title="${n.type==='edit'?'편집하기':'생성하기'}" data-run="${esc(n.id)}" ${nodeLocked(n.id)?'disabled':''}><span aria-hidden="true">↗</span></button></div></div></div>`;
    if(n.type==='color')content=renderColorPanel(n,colorSource(n),nodeLocked(n.id),project.edges.some(edge=>edge.to===n.id));
    const status=state?.state==='queued'?'대기 중':state?.state==='cancelling'?'취소 중':state?.state==='running'?'생성 중':state?.state==='completed'?'완료':state?.state==='reused'?'기존 결과 사용':state?.state==='failed'?'확인 필요':'';
    return `<article class="node ${media?'media-node':n.type==='skill'?'text-node skill-node':'text-node'} ${selectedIds.has(n.id)?'selected':''} ${state?.state==='failed'?'error-node':''}" style="width:${nodeWidth(n.type)}px;left:${n.x}px;top:${n.y}px;--node-tint:${tints[n.type]};--port-color:${n.type==='skill'?'#a36b26':type.output==='text'?'#4262ff':'#79609e'}" data-node="${esc(n.id)}" aria-label="${esc(nodeLabel(n,type.label))} 노드"><div class="node-header" data-drag="${esc(n.id)}"><span class="node-icon" title="이 영역을 끌어 노드 이동">${nodeIcon(n.type)}</span><span class="node-name"><input class="node-label" style="width:${Math.min(230,Math.max(30,[...(n.data.label||type.label)].reduce((size,c)=>size+(/[^\x00-\x7f]/.test(c)?14:7),8)))}px" data-field="label" aria-label="${esc(type.label)} 노드 이름" value="${esc(n.data.label||type.label)}" maxlength="80" ${nodeLocked(n.id)?'disabled':''}><span class="node-sequence" aria-label="노드 번호 ${n.data.sequence}">#${n.data.sequence}</span></span><span class="node-state ${esc(state?.state||'')}">${esc(status)}</span>${renderNodeTools(n)}<button class="node-help" data-action="help" aria-label="${esc(type.label)} 사용 방법" title="${esc(type.label)} 사용 방법">?</button></div>${renderPorts(n)}<div class="node-content">${content}</div></article>`;
}
const colorPanelSources=new WeakMap();
function hydrateColorPanels(){
  for(const node of project.nodes){
    if(node.type!=='color')continue;
    const panel=document.querySelector(`[data-node="${node.id}"] .color-panel`);
    const source=colorSource(node);
    if(!panel||!source||colorPanelSources.get(panel)===source)continue;
    colorPanelSources.set(panel,source);
    void loadColorPanel(panel,source,node);
  }
}
function renderNodes(){
  $('nodes').innerHTML=project.nodes.map(renderNodeMarkup).join('');hydrateColorPanels();
  observeMedia();renderEdges();scheduleUsage();$('graph-stats').textContent=`${project.nodes.length}개 노드 · ${project.edges.length}개 연결`;$('empty-state').hidden=project.nodes.length>0;updatePendingPorts();
}
function updatePendingPorts(){
 $('world').classList.toggle('connecting',Boolean(pendingPort));
 document.querySelectorAll('.port').forEach(el=>{const port=pointerPort(el),same=pendingPort?.id===port.id&&pendingPort.direction===port.direction&&pendingPort.kind===port.kind;const pair=wirePair(pendingPort,port);const compatible=Boolean(pair&&canConnect(project.nodes.find(n=>n.id===pair.from),project.nodes.find(n=>n.id===pair.to),pair.inputKind));el.classList.toggle('pending',Boolean(same));el.classList.toggle('compatible',compatible);el.classList.toggle('incompatible',Boolean(pendingPort&&!same&&!compatible));});
}
function renderAll(){ensureNodeNumbers(project);renderNodes();$('project-name').value=project.name;refreshBusy();}
function changed(){checkpoint();renderAll();scheduleSave();}
function paintSelection(){document.querySelectorAll('.node').forEach(el=>el.classList.toggle('selected',selectedIds.has(el.dataset.node)));}
function select(id){selectedIds.clear();if(id)selectedIds.add(id);selected=id;paintSelection();}
function toggleSelection(id){if(selectedIds.has(id))selectedIds.delete(id);else selectedIds.add(id);selected=selectedIds.has(id)?id:[...selectedIds].at(-1)||null;paintSelection();}
function hideMarquee(){marquee.hidden=true;}
function finishTemporaryPan(){spaceHeld=false;$('viewport').classList.toggle('pan-mode',tool==='pan');}

function closeMenus(returnFocus=false){$('node-menu').hidden=true;$('action-menu').hidden=true;$('template-menu').hidden=true;menuContext=null;if(returnFocus)$('viewport').focus({preventScroll:true});}
function cancelWire(){hideMarquee();pendingPort=null;drag=null;renderWire();updatePendingPorts();document.querySelectorAll('.compatible').forEach(el=>el.classList.remove('compatible'));}
function deleteNode(id){if(!editable(id))return;const node=project.nodes.find(n=>n.id===id);if(!node||!confirm(`“${nodeLabel(node,TYPES[node.type].label)}” 노드와 연결을 삭제할까요?`))return;project.nodes=project.nodes.filter(n=>n.id!==id);project.edges=project.edges.filter(e=>e.from!==id&&e.to!==id);selected=null;selectedIds.clear();cancelWire();closeMenus();changed();}
function duplicateNode(id){if(!editable())return;const node=project.nodes.find(n=>n.id===id);if(!node)return;if(project.nodes.length>=MAX_NODE_COUNT)return notify('노드는 150개까지 추가할 수 있습니다.',true);const copy=structuredClone(node);copy.id=uuid();copy.x+=45;copy.y+=55;try{assignNodeNumber(project,copy);}catch(error){return notify(error.message,true);}project.nodes.push(copy);selected=copy.id;selectedIds.clear();selectedIds.add(copy.id);closeMenus();changed();}
function tryConnect(from,to,inputKind=null){
  if(!editable(from)||!editable(to))return false;
  try{project.edges.push(makeConnection(project,from,to,uuid(),inputKind));cancelWire();$('canvas-hint').textContent='연결했습니다 · 입력한 내용이 다음 노드로 전달됩니다';checkpoint();renderNodes();scheduleSave();return true;}catch(error){notify(error.message,true);return false;}
}
function addNode(type,skillId){
  if(type==='skill'&&!getSkill(skillId))return notify('목록에서 사용할 스킬을 선택하세요.',true);
  if(!editable())return;if(project.nodes.length>=MAX_NODE_COUNT)return notify('노드는 150개까지 추가할 수 있습니다.',true);
  const rect=$('viewport').getBoundingClientRect(),location=menuContext?.world||screenToWorld({x:rect.left+rect.width/2,y:rect.top+rect.height/2},rect,view);
  const node={id:uuid(),type,x:Math.round(location.x),y:Math.round(location.y),data:type==='skill'?createSkillNodeData(skillId):{text:'',ratio:'1:1',label:TYPES[type].label}};
  const origin=menuContext?.port;if(origin&&!editable(origin.id))return;const candidate={...project,nodes:[...project.nodes,node]};
  let edge;if(origin){try{edge=origin.direction==='output'?makeConnection(candidate,origin.id,node.id,uuid()):makeConnection(candidate,node.id,origin.id,uuid(),origin.kind);}catch(error){return notify(error.message,true);}}
  try{assignNodeNumber(project,node);}catch(error){return notify(error.message,true);}if(edge)project.edges.push(edge);project.nodes.push(node);selected=node.id;selectedIds.clear();selectedIds.add(node.id);cancelWire();closeMenus();changed();
  requestAnimationFrame(()=>document.querySelector(`[data-node="${node.id}"] textarea`)?.focus({preventScroll:true}));
}
function menuTypes(){
  const source=menuContext?.port;
  if(!source)return Object.keys(TYPES);
  const node=project.nodes.find(n=>n.id===source.id);
  return source.direction==='output'?compatibleTypes(node):Object.keys(TYPES).filter(type=>canConnect({id:'new-node',type},node,source.kind));
}
function renderMenu(){
 const list=menuEntries({query:$('node-search').value,category:menuCategory,allowed:menuTypes()}).filter(entry=>{if(!entry.skillId)return true;const port=menuContext?.port;if(port?.direction!=='input')return true;return canConnect({id:'new-skill',type:'skill',data:{skill:entry.skillId}},project.nodes.find(n=>n.id===port.id),port.kind);});
 $('menu-items').innerHTML=list.length?list.map(entry=>`<button class="menu-item" ${entry.openSkills?'data-open-skills':`data-add="${entry.type}"${entry.skillId?` data-skill-id="${esc(entry.skillId)}"`:''}`}><span class="item-icon" style="--node-tint:${tints[entry.type]}">${nodeIcon(entry.type)}</span><span><strong>${esc(entry.label)}</strong><small>${esc(entry.description)}</small></span>${entry.openSkills?'<span aria-hidden="true">›</span>':''}</button>`).join(''):'<div class="menu-empty">이 분류에 맞는 노드가 없어요.</div>';
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
function chooseImage(id){if(!editable(id))return;uploadTarget=id;$('image-file').value='';$('image-file').click();}
function downloadBlob(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);}
function downloadImage(data){if(!isImage(data))return;const type=data.slice(5,data.indexOf(';')),bytes=Uint8Array.from(atob(data.split(',')[1]),c=>c.charCodeAt(0));downloadBlob(new Blob([bytes],{type}),`2026-10-31-NodeCanvas-image-v1.13.0.${type.split('/')[1]}`);}
function exportProjectRecord(record){try{const graph=record.project||record;downloadBlob(new Blob([projectJSON(graph)],{type:'application/json'}),`2026-10-31-NodeCanvas-${graph.name.replace(/[^\w가-힣-]/g,'-').slice(0,40)}-v1.13.0.json`);notify('이미지를 포함한 프로젝트 JSON 백업을 다운로드합니다.');return true;}catch(error){notify(error.message,true);return false;}}
function exportProject(){return exportProjectRecord(project);}
function replaceProject(next){if(!projectEditable())return;if(!confirm('현재 워크플로를 교체할까요? 필요한 내용은 먼저 저장으로 백업하세요.'))return;mergeNodeCounters(next,project);project=next;selected=next.nodes[0]?.id||null;selectedIds.clear();if(selected)selectedIds.add(selected);cancelWire();closeMenus();Object.keys(runStates).forEach(k=>delete runStates[k]);history.length=0;historyRender();changed();readableView();}

async function api(route,input={},anonymous=false,timeout=42000) {
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeout);
  try {
    const response=await fetch(bridge.url+'/api/'+route,{method:'POST',mode:'cors',headers:{'Content-Type':'application/json',...(!anonymous?{Authorization:`Bearer ${bridge.token}`}:{})},body:JSON.stringify(input),signal:controller.signal});
    const data=await response.json();
    if(!response.ok){if(response.status===401){bridge.connected=false;renderConnection();}throw Object.assign(new Error(data.error||'연결 요청에 실패했습니다.'),{status:response.status});}
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
function setBusy(value){applyingUpdate=value;refreshBusy();renderNodes();}
function refreshBusy(){busy=applyingUpdate||taskQueue.pending.length>0;updates?.render();updateEditControls();$('run-all').disabled=applyingUpdate;$('cancel-run').hidden=!taskQueue.active||taskQueue.active.projectId!==activeSpaceId;$('cancel-run').title='현재 프로젝트에서 실행 중인 작업 취소';$('open-project').disabled=applyingUpdate;document.querySelectorAll('#add-node,.template').forEach(b=>b.disabled=applyingUpdate);renderConnection();}
function refreshTaskNodes(task){if(activeSpaceId!==task.projectId)return;for(const id of task.nodeIds){const node=project.nodes.find(n=>n.id===id),el=document.querySelector(`[data-node="${id}"]`);if(node&&el)el.outerHTML=renderNodeMarkup(node);}hydrateColorPanels();observeMedia();renderEdges();}
function renderTasks(){const pending=taskQueue.pending,active=taskQueue.active;$('task-dock').hidden=!taskQueue.items.length;$('task-summary').textContent=pending.length?`${active?'1개 실행 중 · ':''}${pending.filter(t=>t.state==='queued').length}개 대기`:'작업 완료 · 기록 보기';const html=[...taskQueue.items].reverse().map(t=>`<li><div><strong>${esc(t.projectName)} · ${esc(t.label)}</strong><span class="task-state">${esc(({queued:'생성 대기 중',running:t.phase||'이미지 생성 중',cancelling:'취소 요청 중',completed:'완료 · 저장됨',cancelled:'취소됨',failed:'확인 필요'})[t.state])}</span>${t.error?`<p class="task-error">${esc(t.error)}</p>`:''}</div>${['queued','running'].includes(t.state)?`<button class="button secondary" data-task-cancel="${esc(t.id)}">취소</button>`:''}${t.unsavedImage?`<button class="button secondary" data-task-download="${esc(t.id)}">미저장 이미지 저장</button>`:''}</li>`).join('');if($('task-items').innerHTML!==html){const focused=document.activeElement,taskId=focused?.dataset?.taskCancel,downloadId=focused?.dataset?.taskDownload,inside=$('task-items').contains(focused);$('task-items').innerHTML=html;if(inside){const next=taskId?document.querySelector(`[data-task-cancel="${taskId}"]`):downloadId?document.querySelector(`[data-task-download="${downloadId}"]`):null;(next||$('task-toggle')).focus({preventScroll:true});}}}
function taskChanged(task){const states=stateByProject.get(task.projectId)||{};stateByProject.set(task.projectId,states);if(activeSpaceId===task.projectId)runStates=states;
 if(task.state==='queued'){for(const id of task.writeIds)states[id]={state:'queued',taskId:task.id};}
 if(task.state==='cancelling'){for(const id of task.nodeIds)if(states[id]?.taskId===task.id&&states[id].state==='running')states[id].state='cancelling';}
 if(['completed','failed','cancelled'].includes(task.state)){for(const id of task.nodeIds)if(states[id]?.taskId===task.id&&['queued','running','cancelling'].includes(states[id].state))states[id]={...states[id],state:task.state==='failed'?'failed':'cancelled'};history.unshift({label:`${task.projectName} · ${task.label}`,state:task.state,message:task.error||({completed:'완료 · 원래 프로젝트에 저장됨',cancelled:'작업 취소'})[task.state],timings:task.timings,time:Date.now()});history.splice(30);historyRender();}
 refreshTaskNodes(task);refreshBusy();renderTasks();
}
function nodeState(task,id,value){const states=stateByProject.get(task.projectId)||{};const changed=Object.entries(value).some(([key,val])=>states[id]?.[key]!==val);states[id]={...states[id],...value,taskId:task.id};stateByProject.set(task.projectId,states);if(activeSpaceId===task.projectId){runStates=states;if(changed)refreshTaskNodes({...task,nodeIds:[id]});}}
function throwCancelled(signal){if(signal.aborted)throw new Error('작업을 취소했습니다.');}
function pause(ms,signal){return new Promise(resolve=>{if(signal.aborted)return resolve();const done=()=>{clearTimeout(timer);signal.removeEventListener('abort',done);resolve();},timer=setTimeout(done,ms);signal.addEventListener('abort',done,{once:true});});}
async function cancelProviderTask(task){if(task.providerJob)await(task.cancelPromise||=api('cancel',{id:task.providerJob}));}
async function storeTaskImage(task,node,image){
 task.unsavedImage=image;const release=await acquireWorkspace();try{
 const sameData=n=>n&&n.type===node.type&&['sequence','skill','text','image','ratio','label'].every(key=>(n.data[key]??'')===(node.data[key]??''));
 if(activeSpaceId===task.projectId){const real=project.nodes.find(n=>n.id===node.id);if(!sameData(real))throw new Error('노드 내용이 변경되어 결과를 덮어쓰지 않았습니다. 미저장 이미지 저장을 눌러 보관하세요.');real.data.image=image;checkpoint('generation:'+task.id);scheduleSave();await persistCurrent();}
 else{let saved=false;for(let attempt=0;attempt<3;attempt++){const record=await getSpace(task.projectId);if(!record||record.trashed)throw new Error('원래 프로젝트를 열 수 없습니다. 미저장 이미지를 저장하세요.');const real=record.project.nodes.find(n=>n.id===node.id);if(!sameData(real))throw new Error('다른 탭에서 노드가 변경되어 덮어쓰지 않았습니다. 미저장 이미지를 저장하세요.');real.data.image=image;try{const next=await saveProject(record.project,task.projectId,{expectedRevision:record.revision});spaceRevisions.set(task.projectId,next.revision);saved=true;break;}catch(error){if(error.code!=='CONFLICT'||attempt===2)throw error;}}if(!saved)throw new Error('이미지 결과를 저장하지 못했습니다.');}
 task.unsavedImage=null;
 }finally{release();}
}
async function runWorkflow(target){
 if(applyingUpdate||!activeSpaceId)return;const originId=activeSpaceId,originSession=projectSession;try{await persistCurrent();if(activeSpaceId!==originId||projectSession!==originSession)return notify('프로젝트가 바뀌어 실행 요청을 등록하지 않았습니다.');const snapshot=structuredClone(project),{order,reused}=executionPlan(snapshot,target);if(!order.length)return notify('노드를 먼저 추가하세요.');const writeIds=order.filter(id=>!reused.has(id)&&['generate','edit'].includes(snapshot.nodes.find(n=>n.id===id).type));
 if(writeIds.length&&(!bridge.connected||!bridge.account)){$('connect-dialog').showModal();return connectionMessage('PC 페어링과 ChatGPT 로그인을 먼저 완료하세요.');}
 const task=taskQueue.add({id:uuid(),projectId:activeSpaceId,projectName:project.name,label:target?nodeLabel(snapshot.nodes.find(n=>n.id===target),'선택 생성'):'전체 워크플로',snapshot,order,reused,nodeIds:order,writeIds});notify(taskQueue.active?'생성 대기열에 등록했습니다. 다른 작업을 준비할 수 있어요.':'작업을 등록했습니다.');
 }catch(error){notify(error.message,true);}
}
async function executeTask(task,signal){
 const record=await getSpace(task.projectId);if(!record||record.trashed)throw new Error('프로젝트가 없거나 휴지통에 있어 실행하지 않았습니다.');
 const snapshot=task.snapshot,outputs={};task.timings={};let current;
 try{for(const id of task.order){throwCancelled(signal);const node=snapshot.nodes.find(n=>n.id===id);if(node.type==='color')continue;current=node;
 if(task.reused.has(id)){outputs[id]={text:'',images:[node.data.image]};continue;}
 const inputs=collectInputs(snapshot,id,outputs);
 if(node.type==='prompt')outputs[id]={text:node.data.text||'',images:[]};
 else if(node.type==='skill')outputs[id]={skills:[node.data.skill]};
 else if(node.type==='image'){if(!isImage(node.data.image))throw new Error('참조 이미지 노드에 이미지를 불러오세요.');outputs[id]={text:'',images:[node.data.image]};}
 else{
 nodeState(task,id,{state:'running',phase:'요청 준비 중',startedAt:Date.now()});task.phase='요청 준비 중';renderTasks();const request=bindMentionPrompt(requestForNode(node,inputs),node,snapshot,outputs),deadline=Date.now()+600000;let response;
 while(!response){throwCancelled(signal);try{response=await api('jobs',request);}catch(error){if(error.status!==409||Date.now()>deadline)throw error;task.phase='연결 앱의 다른 작업 완료 대기';nodeState(task,id,{phase:task.phase});renderTasks();await pause(2500,signal);}}
 task.providerJob=response.id;task.cancelPromise=null;throwCancelled(signal);
 while(true){throwCancelled(signal);const job=await api('job',{id:task.providerJob});throwCancelled(signal);if(job.timings)task.timings[id]=job.timings;task.phase=job.images?.length?'이미지 수신 · 마무리 중':job.timings?.some(t=>t.stage==='generating')?'이미지 생성 중':'AI 응답 대기 중';nodeState(task,id,{phase:task.phase,...(job.images?.[0]?{previewImage:job.images[0]}:{})});renderTasks();
 if(job.state==='completed'){if(!job.images?.length)throw new Error('생성된 이미지를 받지 못했습니다.');outputs[id]={text:'',images:job.images};break;}
 if(['failed','cancelled'].includes(job.state))throw new Error(job.message||'이미지 생성이 중단됐습니다.');await pause(1300,signal);}
 task.providerJob=null;throwCancelled(signal);await storeTaskImage(task,node,outputs[id].images[0]);node.data.image=outputs[id].images[0];nodeState(task,id,{state:'completed',previewImage:null});
 }
 }}catch(error){if(current&&task.writeIds.includes(current.id))nodeState(task,current.id,{state:signal.aborted?'cancelled':'failed',previewImage:null});if(task.providerJob){try{await cancelProviderTask(task);}catch{}task.providerJob=null;}throw error;}
}
setInterval(()=>{document.querySelectorAll('.progress-elapsed[data-start]').forEach(el=>el.textContent=Math.floor((Date.now()-Number(el.dataset.start))/1000)+'초 경과');},1000);
function setTaskPanelOpen(open){
  $('task-items').hidden=!open;
  $('task-toggle').setAttribute('aria-expanded',String(open));
}
$('task-toggle').onclick=()=>setTaskPanelOpen($('task-items').hidden);
document.addEventListener('pointerdown',event=>{
  if(!$('task-items').hidden&&!$('task-dock').contains(event.target))setTaskPanelOpen(false);
},true);
$('task-items').onclick=event=>{const cancel=event.target.closest('[data-task-cancel]');if(cancel)void taskQueue.cancel(cancel.dataset.taskCancel).catch(error=>notify(error.message,true));const download=event.target.closest('[data-task-download]');if(download)downloadImage(taskQueue.items.find(t=>t.id===download.dataset.taskDownload)?.unsavedImage);};



function pointerPort(element){const port=element?.closest?.('[data-input],[data-output]');return port?{id:port.dataset.output||port.dataset.input,direction:port.dataset.output?'output':'input',kind:port.dataset.inputKind,element:port}:null;}
function wirePair(a,b){if(!a||!b||a.direction===b.direction)return null;return a.direction==='output'?{from:a.id,to:b.id,inputKind:b.kind}:{from:b.id,to:a.id,inputKind:a.kind};}
function resetHighlight(){document.querySelectorAll('.port.hover-compatible').forEach(el=>el.classList.remove('hover-compatible'));}
$('viewport').addEventListener('pointerdown',event=>{
  if(event.button!==0||event.isPrimary===false)return;
  if(tool==='pan'||spaceHeld){closeMenus();drag={kind:'pan',blank:!event.target.closest('[data-node],[data-edge],button'),startX:event.clientX,startY:event.clientY,x:view.x,y:view.y,moved:false};$('viewport').setPointerCapture(event.pointerId);event.preventDefault();return;}
  const field=event.target.closest('input,textarea,select');
  if(field){const id=field.closest('[data-node]')?.dataset.node;if(event.ctrlKey||event.metaKey){event.preventDefault();toggleSelection(id);}else if(!selectedIds.has(id))select(id);return;}
  const port=pointerPort(event.target);
  if(port){
    if(!editable(port.id))return;
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
    if(nodeElement){if(!editable(nodeElement.dataset.node)||(selectedIds.has(nodeElement.dataset.node)&&[...selectedIds].some(nodeLocked)))return;const node=project.nodes.find(n=>n.id===nodeElement.dataset.node);if(event.ctrlKey||event.metaKey){toggleSelection(node.id);suppressClickUntil=performance.now()+200;return;}if(!selectedIds.has(node.id))select(node.id);drag={kind:'node',id:node.id,movingIds:new Set(selectedIds),positions:project.nodes.filter(n=>selectedIds.has(n.id)).map(n=>({id:n.id,x:n.x,y:n.y})),upload:selectedIds.size===1&&Boolean(event.target.closest('[data-upload-surface]')),startX:event.clientX,startY:event.clientY,moved:false};}
    else if(!event.target.closest('.node')){const base=event.ctrlKey||event.metaKey?[...selectedIds]:[];if(!base.length)select(null);drag={kind:'marquee',base,startX:event.clientX,startY:event.clientY,moved:false};}
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
  else if(drag.kind==='marquee'){
    if(!drag.moved)return;const left=Math.min(drag.startX,event.clientX),top=Math.min(drag.startY,event.clientY),right=Math.max(drag.startX,event.clientX),bottom=Math.max(drag.startY,event.clientY);
    Object.assign(marquee.style,{left:(left-rect.left)+'px',top:(top-rect.top)+'px',width:(right-left)+'px',height:(bottom-top)+'px'});marquee.hidden=false;
    selectedIds.clear();drag.base.forEach(id=>selectedIds.add(id));document.querySelectorAll('.node').forEach(el=>{const r=el.getBoundingClientRect();if(r.right>=left&&r.left<=right&&r.bottom>=top&&r.top<=bottom)selectedIds.add(el.dataset.node);});selected=[...selectedIds].at(-1)||null;paintSelection();
  }else{const positions=drag.positions;let moveX=dx/view.scale,moveY=dy/view.scale;moveX=Math.max(...positions.map(p=>-100000-p.x),Math.min(moveX,...positions.map(p=>100000-p.x)));moveY=Math.max(...positions.map(p=>-100000-p.y),Math.min(moveY,...positions.map(p=>100000-p.y)));for(const origin of positions){const node=project.nodes.find(n=>n.id===origin.id);if(!node)continue;node.x=Math.round(origin.x+moveX);node.y=Math.round(origin.y+moveY);const element=document.querySelector(`[data-node="${node.id}"]`);if(element){element.style.left=node.x+'px';element.style.top=node.y+'px';}}moveEdgePaths(drag.movingIds);}
});
$('viewport').addEventListener('pointerup',event=>{
  const finished=drag;drag=null;hideMarquee();
  if($('viewport').hasPointerCapture(event.pointerId))$('viewport').releasePointerCapture(event.pointerId);
  if(!finished)return;
  if(finished.kind==='pan'&&!finished.moved&&finished.blank)select(null);
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
const mentionMirrors=new WeakMap();
function refreshMentionHighlights(onlyInput){
  const inputs=onlyInput?[onlyInput]:document.querySelectorAll('.inline-prompt textarea[data-field="text"]');
  for(const input of inputs){
    const node=project.nodes.find(node=>node.id===input.closest('[data-node]')?.dataset.node);
    if(!node)continue;
    const mentions=cleanMentions(node.data.mentions,input.value);
    let view=mentionMirrors.get(input);
    if(!mentions.length){
      if(view){view.mirror.hidden=true;view.warning.hidden=true;input.style.color='';input.style.caretColor='';}
      continue;
    }
    if(!view){
      const wrapper=document.createElement('div');
      wrapper.style.position='relative';
      input.before(wrapper);
      wrapper.append(input);
      const mirror=document.createElement('div');
      mirror.setAttribute('aria-hidden','true');
      Object.assign(mirror.style,{position:'absolute',pointerEvents:'none',overflow:'hidden',whiteSpace:'pre-wrap',overflowWrap:'break-word'});
      wrapper.append(mirror);
      const warning=document.createElement('small');
      warning.textContent='연결 또는 이미지 결과를 확인할 @참조가 있습니다.';
      warning.className='mention-warning';
      wrapper.after(warning);
      const sync=()=>{
        mirror.style.width=input.clientWidth+'px';
        mirror.style.height=input.clientHeight+'px';
        mirror.scrollTop=input.scrollTop;
        mirror.scrollLeft=input.scrollLeft;
      };
      input.addEventListener('scroll',sync);
      view={mirror,warning,sync};
      mentionMirrors.set(input,view);
      mentionResizeObserver.observe(input);
    }
    const {mirror,warning,sync}=view;
    const style=getComputedStyle(input);
    const ink=input.style.color==='transparent'?mirror.style.color:style.color;
    Object.assign(mirror.style,{left:input.offsetLeft+input.clientLeft+'px',top:input.offsetTop+input.clientTop+'px',
      boxSizing:'border-box',padding:style.padding,font:style.font,lineHeight:style.lineHeight,
      letterSpacing:style.letterSpacing,textAlign:style.textAlign,color:ink,tabSize:style.tabSize});
    let end=0,missing=false;
    mirror.replaceChildren();
    for(const {start,token,sourceId} of mentions){
      const source=project.nodes.find(source=>source.id===sourceId);
      const connected=isImage(source?.data.image)&&project.edges.some(edge=>edge.from===sourceId&&edge.to===node.id);
      missing||=!connected;
      const span=document.createElement('span');
      span.textContent=token;
      span.style.color=connected?'#b7cdff':'#ffd0ca';
      mirror.append(input.value.slice(end,start),span);
      end=start+token.length;
    }
    mirror.append(input.value.slice(end)+'\u200b');
    mirror.hidden=false;
    warning.hidden=!missing;
    input.style.caretColor=ink;
    input.style.color='transparent';
    sync();
  }
}
const mentionResizeObserver=new ResizeObserver(entries=>{
  for(const {target} of entries)mentionMirrors.get(target)?.sync();
});
let mentionMenu=null;
function closeMentionMenu(){
  mentionMenu?.element.remove();
  mentionMenu=null;
}
function showMentionMenu(input){
  closeMentionMenu();
  const node=project.nodes.find(node=>node.id===input.closest('[data-node]')?.dataset.node);
  if(!node||!['generate','edit'].includes(node.type)||input.selectionStart!==input.selectionEnd)return;
  const caret=input.selectionStart;
  const match=/(?:^|\s)@([^@\n]{0,80})$/.exec(input.value.slice(0,caret));
  if(!match)return;
  const start=caret-match[1].length-1;
  if(node.data.mentions?.some(item=>item.start===start&&input.value.slice(start,caret)===item.token))return;
  const candidates=mentionCandidates(project,node,match[1]);
  const exact=exactMention(candidates,match[1]);
  const commit=source=>{
    if(!input.isConnected||nodeLocked(node.id)||nodeLocked(source.id)){closeMentionMenu();return;}
    const title=mentionTitle(source);
    const duplicate=candidates.some(item=>item.id!==source.id&&mentionTitle(item).toLowerCase()===title.toLowerCase());
    const suffix=duplicate?' #'+source.data.sequence:'';
    const token='@'+title.slice(0,80-suffix.length)+suffix;
    const before=input.value;
    if(before.length-(caret-start)+token.length+1>16000)return notify('프롬프트는 16,000자까지 입력할 수 있습니다.',true);
    const exists=project.edges.some(edge=>edge.from===source.id&&edge.to===node.id);
    if(!exists){
      try{project.edges.push(makeConnection(project,source.id,node.id,uuid(),'image'));}
      catch(error){notify(error.message,true);return;}
    }
    input.setRangeText(token+' ',start,caret,'end');
    node.data.mentions=[...moveMentions(node.data.mentions,before,input.value),{start,token,sourceId:source.id}].sort((a,b)=>a.start-b.start);
    input.dataset.mentionCommit='true';
    closeMentionMenu();
    input.focus();
    input.dispatchEvent(new Event('input',{bubbles:true}));
    if(!exists){
      renderEdges();
      updatePendingPorts();
      scheduleUsage();
      $('graph-stats').textContent=project.nodes.length+'개 노드 · '+project.edges.length+'개 연결';
    }
  };
  const element=document.createElement('div');
  element.setAttribute('role','group');
  element.setAttribute('aria-label','프로젝트 참조 이미지');
  Object.assign(element.style,{position:'fixed',zIndex:20,background:'white',border:'1px solid #d3d4d9',
    borderRadius:'10px',padding:'6px',maxHeight:'240px',overflow:'auto',boxShadow:'0 4px 16px #0002'});
  const rect=input.getBoundingClientRect();
  element.style.left=Math.max(8,Math.min(rect.left,innerWidth-248))+'px';
  element.style.width='240px';
  element.style.top=Math.max(8,Math.min(rect.bottom+4,innerHeight-248))+'px';
  for(const source of candidates){
    const title=mentionTitle(source);
    const button=document.createElement('button');
    button.type='button';
    Object.assign(button.style,{display:'flex',alignItems:'center',gap:'8px',width:'100%',padding:'5px',textAlign:'left'});
    const thumb=new Image(36,28);
    thumb.src=source.data.image;thumb.alt='';thumb.style.objectFit='cover';
    button.append(thumb,document.createTextNode(title+' #'+source.data.sequence));
    button.addEventListener('click',()=>commit(source));
    element.append(button);
  }
  if(!element.childElementCount)return;
  document.body.append(element);
  mentionMenu={element,input,exact,commit};
}
document.addEventListener('pointerdown',event=>{
  if(mentionMenu&&!mentionMenu.element.contains(event.target)&&event.target!==mentionMenu.input)closeMentionMenu();
});
document.addEventListener('keydown',event=>{
  if(!mentionMenu||isImeKey(event))return;
  const {element,input,exact,commit}=mentionMenu;
  const buttons=[...element.querySelectorAll('button')],index=buttons.indexOf(event.target);
  if(event.target!==input&&index<0)return;
  if(event.target===input&&event.key==='Enter'&&!event.shiftKey&&exact){event.preventDefault();event.stopPropagation();commit(exact);return;}
  if(event.key==='Escape'){event.preventDefault();event.stopPropagation();closeMentionMenu();input.focus();}
  if(event.key==='ArrowDown'||event.key==='ArrowUp'){
    event.preventDefault();event.stopPropagation();
    const next=index<0?(event.key==='ArrowDown'?0:buttons.length-1):(index+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length;
    buttons[next].focus();
  }
},true);
$('nodes').addEventListener('compositionend',event=>{
  if(event.target.matches('textarea[data-field="text"]'))showMentionMenu(event.target);
});
$('nodes').addEventListener('input',event=>{
  const slider=event.target.closest('[data-color]');
  if(slider){
    const node=project.nodes.find(n=>n.id===slider.closest('[data-node]').dataset.node);
    if(nodeLocked(node.id))return;
    node.data.color=colorSettings({...node.data.color,[slider.dataset.color]:Number(slider.value)});
    slider.previousElementSibling.value=slider.value;
    refreshColorPanel(slider.closest('.color-panel'),node);
    checkpoint('color:'+node.id+':'+slider.dataset.color);scheduleSave();
    return;
  }
  const input=event.target.closest('[data-field]');if(!input)return;
  const node=project.nodes.find(n=>n.id===input.closest('[data-node]')?.dataset.node);if(!node||nodeLocked(node.id))return;
  const committed=input.dataset.mentionCommit==='true';
  if(input.dataset.field==='text'&&['generate','edit'].includes(node.type)){
    if(!committed)node.data.mentions=moveMentions(node.data.mentions,node.data.text||'',input.value);
    delete input.dataset.mentionCommit;
  }
  node.data[input.dataset.field]=input.value;if(input.dataset.field==='ratio')input.closest('.prompt-card-media').dataset.ratio=nodeRatio(node);if(input.dataset.field==='label')input.style.width=Math.min(230,Math.max(30,[...input.value].reduce((size,c)=>size+(/[^\x00-\x7f]/.test(c)?14:7),8)))+'px';delete runStates[node.id];
  if(input.matches('textarea[data-field="text"]')&&!event.isComposing)showMentionMenu(input);
  if(input.matches('.inline-prompt textarea[data-field="text"]'))refreshMentionHighlights(input);
  const count=input.closest('.node').querySelector('[data-char-count]');if(count)count.textContent=(node.data.text||'').length+'자';
  refreshPromptGuidance();
  checkpoint(committed?null:'field:'+node.id+':'+input.dataset.field);scheduleSave();
});
$('nodes').addEventListener('click',event=>{
  const helpButton=event.target.closest('button[data-action="help"]');
  if(helpButton){
    const node=project.nodes.find(node=>node.id===helpButton.closest('[data-node]')?.dataset.node);
    if(node)showNodeHelp(node.type);
    return;
  }
  if(performance.now()<suppressClickUntil)return;
  const element=event.target.closest('[data-node]');if(!element)return;const id=element.dataset.node;
  const port=pointerPort(event.target);
  if(port){if(event.detail!==0)return;if(!editable())return;const pair=wirePair(pendingPort,port);if(pair){tryConnect(pair.from,pair.to,pair.inputKind);cancelWire();}else{pendingPort={id:port.id,direction:port.direction,kind:port.kind};updatePendingPorts();$('canvas-hint').textContent='이동할 입력/출력 포트를 Tab으로 선택하고 Enter로 연결하세요';}return;}
  if(event.target.closest('input,textarea,select'))return;
  if((event.ctrlKey||event.metaKey)&&!event.target.closest('button'))return;
  if(!selectedIds.has(id))select(id);
  const sourceId=event.target.closest('[data-prompt-source]')?.dataset.promptSource;if(sourceId){const source=project.nodes.find(n=>n.id===sourceId);if(source){select(source.id);const rect=$('viewport').getBoundingClientRect();view.x=rect.width/2-(source.x+nodeWidth(source.type)/2)*view.scale;view.y=100-source.y*view.scale;updateView();document.querySelector(`[data-node="${source.id}"] textarea`)?.focus({preventScroll:true});}return;}
  const action=event.target.closest('[data-action]')?.dataset.action;
  if(action?.startsWith('color-')){
    if(nodeLocked(id))return;
    const panel=element.querySelector('.color-panel');
    const node=project.nodes.find(n=>n.id===id);
    if(action==='color-compare'){
      const button=event.target.closest('button');
      button.setAttribute('aria-pressed',String(button.getAttribute('aria-pressed')!=='true'));
      refreshColorPanel(panel,node);
    }
    if(action==='color-reset'){
      node.data.color=colorSettings();
      panel.querySelectorAll('[data-color]').forEach(slider=>{
        slider.value='0';slider.previousElementSibling.value='0';
      });
      panel.querySelector('[data-action="color-compare"]').setAttribute('aria-pressed','false');
      refreshColorPanel(panel,node);checkpoint();scheduleSave();
    }
    if(action==='color-save')void colorPng(panel,node.data.color)
      .then(blob=>downloadBlob(blob,'2026-11-03-NodeCanvas-color-v1.14.2.png'))
      .catch(error=>notify(error.message,true));
    return;
  }
  if(action==='upload')return chooseImage(id);
  if(action==='duplicate')return duplicateNode(id);
  if(action==='delete')return deleteNode(id);
  if(event.target.closest('[data-upload-surface]')){if(event.detail===0)return chooseImage(id);return;}
  if(action==='download'){downloadImage(displayedImage(project.nodes.find(n=>n.id===id)));if(event.detail>0)event.target.closest('button')?.blur();return;}
  if(event.target.closest('[data-run]'))void runWorkflow(id);
});
$('viewport').addEventListener('contextmenu',event=>{
  if(event.target.closest('input,textarea'))return;
  event.preventDefault();cancelWire();
  const node=event.target.closest('[data-node]');
  if(node)openActionMenu(node.dataset.node,event.clientX,event.clientY);else openNodeMenu(event.clientX,event.clientY);
});
$('viewport').addEventListener('dblclick',event=>{if(!event.target.closest('.node,[data-edge]'))openNodeMenu(event.clientX,event.clientY);});
function removeEdge(event){const edge=event.target.closest('[data-edge]');if(edge&&(()=>{const e=project.edges.find(e=>e.id===edge.dataset.edge);return e&&editable(e.from)&&editable(e.to);})()&&confirm('이 노드 연결을 해제할까요?')){project.edges=project.edges.filter(e=>e.id!==edge.dataset.edge);changed();}}
$('edges').onclick=removeEdge;$('edges').onkeydown=event=>{if(['Enter',' '].includes(event.key)){event.preventDefault();removeEdge(event);}};
$('viewport').addEventListener('wheel',event=>{
  if(event.target.closest('textarea,select'))return;
  event.preventDefault();if(drag)return;
  const rect=$('viewport').getBoundingClientRect();zoom(Math.exp(-event.deltaY*.0012),event.clientX-rect.left,event.clientY-rect.top);
},{passive:false});
$('add-node').onclick=()=>{const rect=$('viewport').getBoundingClientRect();openNodeMenu(rect.left+Math.min(220,rect.width/2),rect.top+100);};
$('node-search').oninput=renderMenu;
$('menu-tabs').onclick=event=>{const button=event.target.closest('[data-category]');if(button){menuCategory=button.dataset.category;renderMenu();}};
function showNodeHelp(type){
  const help=NODE_HELP[type];
  if(!help)return;
  for(const field of ['title','summary','inputs','outputs','example','tip']){
    $('node-help-'+field).textContent=help[field]||'';
  }
  $('node-help-tip').hidden=!help.tip;
  $('node-help-dialog').showModal();
}
function setTool(next){cancelWire();tool=next;$('viewport').classList.toggle('pan-mode',tool==='pan');$('select-tool').setAttribute('aria-pressed',String(tool==='select'));$('pan-tool').setAttribute('aria-pressed',String(tool==='pan'));}
$('select-tool').onclick=()=>setTool('select');$('pan-tool').onclick=()=>setTool('pan');
$('menu-items').onclick=event=>{if(event.target.closest('[data-open-skills]')){menuCategory='skill';renderMenu();$('menu-items').querySelector('button')?.focus();return;}const button=event.target.closest('[data-add]');if(button)addNode(button.dataset.add,button.dataset.skillId);};
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
document.addEventListener('pointerdown',event=>{const active=document.activeElement;if(active?.matches('input,textarea,select,[contenteditable="true"],.node-tools button,.node button[data-action="download"]')&&active!==event.target&&!active.contains(event.target))active.blur();
 else if(event.pointerType==='mouse'&&event.button===0&&active?.matches('button[data-action="help"]')&&!active.closest('[data-node]')?.contains(event.target))active.blur();
},true);
document.addEventListener('pointerdown',event=>{if(!event.target.closest('#node-menu,#action-menu,#template-menu,#add-node,#templates-open,.port'))closeMenus();});
$('zoom-in').onclick=()=>zoom(1.15);$('zoom-out').onclick=()=>zoom(1/1.15);$('zoom-reset').onclick=()=>zoom(1/view.scale);$('fit-view').onclick=fitView;
$('project-name').oninput=event=>{if(!editable()){event.target.value=project.name;return;}project.name=event.target.value;checkpoint('project-name');scheduleSave();};
$('export-project').onclick=exportProject;
$('open-project').onclick=()=>{if(editable()){$('project-file').value='';$('project-file').click();}};
$('project-file').onchange=async event=>{const file=event.target.files[0];if(!file)return;try{if(file.size>MAX_PROJECT_BYTES)throw new Error('프로젝트 JSON은 200MB까지 열 수 있습니다.');await library.importProject(restoreProject(await file.text()));}catch(error){notify(error.message,true);}};
let imageImportBusy=false;
async function importImageFiles(files,{targetId=null,point={x:100,y:100}}={}){
 if(!activeSpaceId||document.body.classList.contains('show-library'))return notify('프로젝트를 연 뒤 캔버스에 이미지 파일을 놓으세요.');
 if(imageImportBusy)return notify('이미지를 불러오는 중입니다. 잠시 기다려 주세요.');if(!files.length)return;
 if(targetId&&files.length!==1)return notify('이미지 교체는 한 장만 놓으세요. 여러 이미지는 빈 캔버스에 놓으세요.',true);
 if(targetId&&!editable(targetId))return;
 if(!targetId&&project.nodes.length+files.length>MAX_NODE_COUNT)return notify('노드는 프로젝트당 150개까지 추가할 수 있습니다.',true);
 if(files.some(file=>file.size>8_000_000))return notify('이미지는 파일당 8MB 이하로 불러오세요.',true);
 if(!targetId&&projectBytes(project)+files.reduce((sum,file)=>sum+Math.ceil(file.size/3)*4+500,0)>MAX_PROJECT_BYTES)return notify('이미지를 추가하면 프로젝트의 200MB 한도를 넘습니다. 이미지 수나 용량을 줄여 주세요.',true);
 const ticket={id:activeSpaceId,session:projectSession};imageImportBusy=true;$('viewport').setAttribute('aria-busy','true');
 try{const items=[];for(const file of files)items.push(await readImageFile(file));
 if(activeSpaceId!==ticket.id||projectSession!==ticket.session)return notify('프로젝트가 바뀌어 이미지 추가를 중단했습니다. 현재 프로젝트에 다시 놓으세요.');
 if(targetId&&!editable(targetId))return;
 const candidate={...project,nodeCounters:{...project.nodeCounters},nodes:project.nodes.map(n=>({...n,data:{...n.data}})),edges:project.edges.map(e=>({...e}))},added=[];
 if(targetId){const node=candidate.nodes.find(n=>n.id===targetId&&n.type==='image');if(!node)return notify('이미지 업로드 노드에만 교체할 수 있습니다.',true);node.data.image=items[0].image;node.data.label=items[0].label;added.push(node.id);}
 else{const positions=imageGrid(items,point,IMAGE_NODE_WIDTH);for(let i=0;i<items.length;i++){const node={id:uuid(),type:'image',...positions[i],data:{image:items[i].image,label:items[i].label,text:'',ratio:'1:1'}};assignNodeNumber(candidate,node);candidate.nodes.push(node);added.push(node.id);}}
 project=normalizeProject(candidate);ensureNodeNumbers(project);suppressClickUntil=0;selectedIds.clear();added.forEach(id=>selectedIds.add(id));selected=added.at(-1)||null;changed();notify(targetId?'이미지를 바꿨습니다. 노드 번호와 연결은 유지됩니다.':`${items.length}개 이미지 노드를 추가했습니다. 원본 해상도는 유지됩니다.`);
 }catch(error){notify(error.message,true);}finally{imageImportBusy=false;$('viewport').removeAttribute('aria-busy');}
}
$('image-file').onchange=event=>{const file=event.target.files[0];if(file)void importImageFiles([file],{targetId:uploadTarget});};
const fileDrag=event=>Array.from(event.dataTransfer?.types||[]).includes('Files');
function clearDropHint(){$('viewport').classList.remove('file-drop-active');document.querySelectorAll('.image-drop-target').forEach(el=>el.classList.remove('image-drop-target'));}
window.addEventListener('dragover',event=>{if(fileDrag(event))event.preventDefault();});
window.addEventListener('drop',event=>{if(fileDrag(event)){event.preventDefault();clearDropHint();if(!event.target.closest('#viewport'))notify('프로젝트의 캔버스 안에 이미지 파일을 놓으세요.');}});
$('viewport').addEventListener('dragover',event=>{if(!fileDrag(event))return;event.preventDefault();event.dataTransfer.dropEffect='copy';clearDropHint();$('viewport').classList.add('file-drop-active');const el=event.target.closest('[data-node]');if(project.nodes.find(n=>n.id===el?.dataset.node)?.type==='image')el.classList.add('image-drop-target');});
$('viewport').addEventListener('dragleave',event=>{if(!event.relatedTarget||!$('viewport').contains(event.relatedTarget))clearDropHint();});
$('viewport').addEventListener('drop',event=>{if(!fileDrag(event))return;event.preventDefault();clearDropHint();const el=event.target.closest('[data-node]'),node=project.nodes.find(n=>n.id===el?.dataset.node);if(node&&node.type!=='image')return notify('빈 캔버스 또는 이미지 업로드 노드에 놓으세요. 생성·편집 결과는 교체하지 않습니다.');const point=screenToWorld({x:event.clientX,y:event.clientY},$('viewport').getBoundingClientRect(),view);void importImageFiles(Array.from(event.dataTransfer.files),{targetId:node?.id,point});});
window.addEventListener('blur',clearDropHint);window.addEventListener('dragend',clearDropHint);
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
$('cancel-run').onclick=()=>{if(taskQueue.active)void taskQueue.cancel(taskQueue.active.id).catch(error=>notify(error.message,true));};
$('history-toggle').onclick=()=>{$('history-list').hidden=!$('history-list').hidden;};
document.addEventListener('keydown',event=>{
  if(isImeKey(event))return;
  if(document.body.classList.contains('show-library'))return;
  if((event.ctrlKey||event.metaKey)&&['z','y'].includes(event.key.toLowerCase())&&!event.target.closest('input,textarea,select')&&!document.querySelector('dialog[open]')){event.preventDefault();undoEdit(event.shiftKey||event.key.toLowerCase()==='y');return;}
  if(event.key==='Escape'){clearDropHint();select(null);cancelWire();closeMenus();finishTemporaryPan();$('canvas-hint').textContent='드래그로 다중 선택 · Ctrl+클릭으로 추가 선택 · Space+드래그로 화면 이동';return;}
  if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='s'){event.preventDefault();exportProject();}
  if(['INPUT','TEXTAREA','SELECT'].includes(event.target.tagName)||document.querySelector('dialog[open]'))return;
  if(event.key.toLowerCase()==='v')setTool('select');
  if(event.key.toLowerCase()==='h')setTool('pan');
  if(event.key==='Delete'&&selected)deleteNode(selected);
  if(event.code==='Space'&&!event.target.closest('#node-menu,#action-menu,#template-menu,[contenteditable],dialog')){
    spaceHeld=true;$('viewport').classList.add('pan-mode');
    if(!event.target.closest('button')||event.target.closest('button[data-action="help"]'))event.preventDefault();
  }
  if(event.key==='ContextMenu'||(event.shiftKey&&event.key==='F10')){event.preventDefault();const rect=$('viewport').getBoundingClientRect();openNodeMenu(rect.left+rect.width/2,rect.top+150);}
});
document.addEventListener('keyup',event=>{if(event.code==='Space')finishTemporaryPan();});
window.addEventListener('blur',()=>{finishTemporaryPan();if(drag?.kind==='node'&&drag.moved){checkpoint();scheduleSave();}cancelWire();});
document.addEventListener('visibilitychange',()=>{if(document.hidden){finishTemporaryPan();hideMarquee();}else void heartbeat();});
window.addEventListener('resize',()=>closeMenus());
renderAll();historyRender();readableView();
try{library=await initializeLibrary({beforeLeave:leaveProject,afterTransition:endTransition,canRemoveProject:id=>!taskQueue.hasProject(id),openProject:enterProject,onLibrary:releaseProject,backupProject:exportProjectRecord,notify});}catch(error){notify(error.message,true);$('spaces-grid').setAttribute('aria-busy','false');$('spaces-grid').textContent='프로젝트를 불러오지 못했습니다. 저장소 권한을 확인하고 새로고침해 주세요.';$('new-space').disabled=true;}
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


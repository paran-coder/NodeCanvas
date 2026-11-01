export function updatePresentation(status,busy){
 const ready=status?.state==='ready';return {ready,disabled:!ready||busy,message:ready&&busy?'업데이트 준비 완료 · 현재 작업이 끝나면 적용할 수 있어요.':status?.message||'업데이트 확인 중'};
}
export function initializeUpdates({api,connected,busy,beforeApply,reconnect,afterApply,notify,root=document}){
 const card=root.getElementById('connector-update'),message=root.getElementById('update-message'),button=root.getElementById('update-apply'),retry=root.getElementById('update-check'),badge=root.getElementById('update-badge');let status=null,applying=false,polling=false,announced='',checked=false;
 function render(){const ui=updatePresentation(status,busy());card.hidden=(!connected()&&!applying)||['current','idle'].includes(status?.state);card.classList.toggle('error',status?.state==='error');message.textContent=ui.message;button.hidden=!ui.ready&&!applying;button.disabled=ui.disabled||applying;button.textContent=applying?'업데이트 적용 중…':'지금 적용';badge.hidden=!ui.ready;retry.disabled=applying;}
 async function refresh(check=false){if(applying||polling||!connected()){render();return;}polling=true;try{const shouldCheck=check||!checked;checked=true;status=await api(shouldCheck?'update/check':'update/status',{},false,5000);if(status.state==='ready'&&announced!==status.version){announced=status.version;notify('연결 앱 업데이트가 준비됐습니다. AI 연결에서 지금 적용할 수 있어요.');}}catch{status={state:'unsupported',message:'새 연결 앱을 한 번 설치하면 다음 버전부터 업데이트를 안내합니다.'};}finally{polling=false;render();}}
 retry.onclick=()=>void refresh(true);
 button.onclick=async()=>{if(applying||busy()||status?.state!=='ready')return;applying=true;render();let prepared=false;try{
 const targetVersion=status.version;await beforeApply();prepared=true;
 const secret=Array.from(crypto.getRandomValues(new Uint8Array(32)),n=>n.toString(16).padStart(2,'0')).join('');
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(secret));const challenge=Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,'0')).join('');
 await api('update/apply',{challenge},false,10000);status={state:'applying',message:'연결 앱을 갱신하고 있습니다. 잠시 기다려 주세요.'};render();
 const version=await reconnect(secret);if(version!==targetVersion)throw new Error('새 버전 적용을 완료하지 못해 기존 앱으로 다시 연결됐습니다.');status=null;notify('연결 앱이 다시 연결됐습니다. 로그인 상태를 확인해 주세요.');
 }catch(error){status={state:'error',message:error.message+' 기존 앱 복구 후 PC 연결하기를 누르거나 설치 파일로 복구해 주세요.'};notify(status.message,true);}finally{applying=false;if(prepared)afterApply();render();void refresh();}};
 const timer=setInterval(()=>void refresh(),10000);void refresh();return {refresh,render,close:()=>clearInterval(timer)};
}

export const CATALOG=[
  {type:'skill',label:'HairLock',category:'skill',description:'얼굴을 유지하는 헤어 편집 스킬',icon:'✂'},
  {type:'image',label:'이미지 업로드',category:'image',description:'내 이미지 가져오기',icon:'↥'},
  {type:'generate',label:'이미지 생성기',category:'image',description:'글로 이미지 만들기',icon:'✦'},
  {type:'edit',label:'이미지 편집기',category:'image',description:'이미지 수정하기',icon:'◈'},
  {type:'prompt',label:'텍스트',category:'text',description:'프롬프트와 메모 입력',icon:'T'},
];
export function filterCatalog({category='all',query='',allowed=CATALOG.map(n=>n.type)}={}){
  const search=query.trim().toLocaleLowerCase('ko-KR');
  return CATALOG.filter(n=>allowed.includes(n.type)&&(category==='all'||n.category===category)&&(`${n.label} ${n.description} ${n.type}`.toLocaleLowerCase('ko-KR').includes(search))).map(n=>n.type);
}
export function requiresMedia(type){return ['image','generate','edit'].includes(type);}

export const NODE_HELP={
 skill:{title:'HairLock · 헤어 편집 스킬',summary:'원본 얼굴 특징을 유지하며 헤어스타일을 바꾸도록 안내하는 지침입니다. 이 노드 자체는 이미지를 생성하지 않습니다.',inputs:'없음 · 기본 제공 HairLock v1.0.1 원문',outputs:'스킬 지침',example:'HairLock 스킬 → 이미지 편집기의 스킬 입력',tip:'원본 이미지는 편집기의 이미지 입력에 따로 연결하세요. 원하는 헤어스타일은 편집기 안에 적습니다. 스킬 연결을 끊으면 해제됩니다.'},
 prompt:{title:'텍스트 · 프롬프트',summary:'지시문을 재사용하거나 여러 생성·편집 카드에 공유할 때 선택적으로 사용합니다. 기본 생성에는 필요하지 않습니다.',inputs:'직접 입력한 지시문',outputs:'텍스트',example:'텍스트 → 이미지 생성 → 이미지 저장'},
 image:{title:'이미지 업로드',summary:'내 컴퓨터의 이미지를 불러와 생성이나 편집에 사용할 재료로 전달합니다.',inputs:'PNG · JPG · WebP 파일',outputs:'업로드한 이미지',example:'이미지 업로드 → 이미지 편집기에 지시 입력 → 이미지 저장',tip:'카드를 짧게 클릭하면 파일 선택, 누른 채 끌면 노드 이동입니다. 이미지가 있어도 같은 방식으로 바꿀 수 있어요.'},
 generate:{title:'이미지 생성',summary:'입력한 지시문과 연결된 자료를 바탕으로 AI가 새 이미지를 만듭니다.',inputs:'텍스트와 선택 사항인 참조 이미지',outputs:'AI가 생성한 이미지',example:'이미지 생성기에 지시 입력 → 생성 → 이미지 저장',tip:'카드 안에 바로 지시문을 입력해도 됩니다. AI 연결과 ChatGPT 로그인이 필요합니다.'},
 edit:{title:'이미지 편집',summary:'연결된 이미지에서 바꿀 부분과 유지할 부분을 지시해 AI로 수정합니다.',inputs:'이미지와 편집 지시문 · 선택 사항인 스킬',outputs:'AI가 수정한 이미지',example:'이미지 업로드 → 이미지 편집기에 지시 입력 → 이미지 저장',tip:'카드 안에 편집 지시를 직접 입력하세요. 편집할 이미지가 최소 한 장 필요합니다. 생성한 이미지도 연결할 수 있어요.'},
};

export function authPhase(status,pending=false){return status.error?'error':status.account?'signed-in':pending?'pending':'ready';}
export function officialLoginUrl(value){try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password&&['auth.openai.com','auth0.openai.com','chatgpt.com'].includes(url.hostname);}catch{return false;}}

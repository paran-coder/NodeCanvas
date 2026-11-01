export const CATALOG=[
  {type:'image',label:'이미지 업로드',category:'image',group:'미디어',description:'이미지를 내 컴퓨터에서 가져오기',icon:'↥'},
  {type:'generate',label:'이미지 생성기',category:'image',group:'노드',description:'이미지 · 프롬프트로 새롭게 생성',icon:'✦'},
  {type:'edit',label:'이미지 편집기',category:'image',group:'노드',description:'이미지 · 참조 이미지를 수정',icon:'◈'},
  {type:'prompt',label:'텍스트',category:'text',group:'노드',description:'텍스트 · 프롬프트와 메모',icon:'T'},
  {type:'result',label:'결과',category:'utility',group:'노드',description:'이미지 자동 미리보기 · AI 실행 없이 저장',icon:'▧'},
];
export function filterCatalog({category='all',query='',allowed=CATALOG.map(n=>n.type)}={}){
  const search=query.trim().toLocaleLowerCase('ko-KR');
  return CATALOG.filter(n=>allowed.includes(n.type)&&(category==='all'||n.category===category)&&(`${n.label} ${n.description} ${n.type}`.toLocaleLowerCase('ko-KR').includes(search))).map(n=>n.type);
}
export function requiresMedia(type){return ['image','generate','edit','result'].includes(type);}

export const NODE_HELP={
 prompt:{title:'텍스트 · 프롬프트',summary:'만들고 싶은 장면과 스타일을 글로 적어 다음 노드에 전달합니다.',inputs:'직접 입력한 지시문',outputs:'텍스트',example:'텍스트 → 이미지 생성 → 결과'},
 image:{title:'이미지 업로드',summary:'내 컴퓨터의 이미지를 불러와 생성이나 편집에 사용할 재료로 전달합니다.',inputs:'PNG · JPG · WebP 파일',outputs:'업로드한 이미지',example:'이미지 업로드 + 텍스트 → 이미지 편집 → 결과',tip:'카드를 짧게 클릭하면 파일 선택, 누른 채 끌면 노드 이동입니다. 이미지가 있어도 같은 방식으로 바꿀 수 있어요.'},
 generate:{title:'이미지 생성',summary:'입력한 지시문과 연결된 자료를 바탕으로 AI가 새 이미지를 만듭니다.',inputs:'텍스트와 선택 사항인 참조 이미지',outputs:'AI가 생성한 이미지',example:'텍스트 → 이미지 생성 → 결과',tip:'카드 안에 바로 지시문을 입력해도 됩니다. AI 연결과 ChatGPT 로그인이 필요합니다.'},
 edit:{title:'이미지 편집',summary:'연결된 이미지에서 바꿀 부분과 유지할 부분을 지시해 AI로 수정합니다.',inputs:'이미지와 편집 지시문',outputs:'AI가 수정한 이미지',example:'이미지 업로드 + 텍스트 → 이미지 편집 → 결과',tip:'편집할 이미지가 최소 한 장 필요합니다. 생성한 이미지도 연결할 수 있어요.'},
 result:{title:'결과',summary:'연결된 최신 이미지를 실행 없이 자동으로 보여주고 저장합니다. 이미지를 새로 생성하지 않으며 연결을 해제하면 미리보기도 비워집니다.',inputs:'생성 · 편집 · 업로드 노드의 이미지',outputs:'연결된 결과 이미지',example:'이미지 생성 → 결과 → 이미지 저장',tip:'생성·편집 카드에서도 미리보기와 저장이 가능합니다. 결과 노드는 선택 사항입니다. 연결하면 즉시 표시되며 AI를 다시 실행하지 않습니다. 여러 이미지를 연결하면 연결 순서에서 처음 사용 가능한 이미지를 보여줍니다.'},
};

export function authPhase(status,pending=false){return status.error?'error':status.account?'signed-in':pending?'pending':'ready';}
export function officialLoginUrl(value){try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password&&['auth.openai.com','auth0.openai.com','chatgpt.com'].includes(url.hostname);}catch{return false;}}

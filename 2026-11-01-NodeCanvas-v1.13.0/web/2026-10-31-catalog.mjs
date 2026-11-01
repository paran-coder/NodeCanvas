import {SKILLS} from './2026-11-01-skills.mjs';
export function skillCatalog(skills=SKILLS){return skills.map(skill=>({type:'skill',skillId:skill.id,label:skill.name,category:'skill',description:skill.description,icon:'🧩'}));}
export const CATALOG=[
 {type:'image',label:'이미지 업로드',category:'image',description:'내 이미지 가져오기',icon:'↥'},
 {type:'generate',label:'이미지 생성기',category:'image',description:'글로 이미지 만들기',icon:'✦'},
 {type:'edit',label:'이미지 편집기',category:'image',description:'이미지 수정하기',icon:'◈'},
 {type:'prompt',label:'텍스트',category:'text',description:'프롬프트와 메모 입력',icon:'T'},...skillCatalog()
];
export function catalogEntries({category='all',query='',allowed=CATALOG.map(n=>n.type)}={}){const search=query.trim().toLocaleLowerCase('ko-KR');return CATALOG.filter(n=>allowed.includes(n.type)&&(category==='all'||n.category===category)&&(`${n.label} ${n.description} ${n.type}`.toLocaleLowerCase('ko-KR').includes(search)));}
export function filterCatalog(options={}){return [...new Set(catalogEntries(options).map(n=>n.type))];}
export function menuEntries(options={}){const entries=catalogEntries(options);if((options.category||'all')==='all'&&!options.query?.trim()&&entries.some(e=>e.type==='skill'))return [...entries.filter(e=>e.type!=='skill'),{type:'skill',label:'스킬',description:'목록에서 스킬 선택',openSkills:true}];return entries;}
export function requiresMedia(type){return ['image','generate','edit'].includes(type);}

export const NODE_HELP={
 skill:{title:'스킬 노드',summary:'목록에서 선택한 이미지 제작 지침을 연결된 노드에 전달합니다. 이 노드 자체는 이미지를 생성하지 않습니다.',inputs:'스킬 목록에서 선택한 항목',outputs:'스킬 지침',example:'HairLock 스킬 → 다음 이미지 생성·편집기의 스킬 입력',tip:'이전 결과 이미지는 다음 생성·편집기의 이미지 입력에 연결하세요. 헤어스타일은 다음 노드 안에 적습니다. 선택 실행 시 완성된 이전 결과는 재사용합니다. 스킬 연결을 끊으면 해제됩니다.'},
 prompt:{title:'텍스트 · 프롬프트',summary:'지시문을 재사용하거나 여러 생성·편집 카드에 공유할 때 선택적으로 사용합니다. 기본 생성에는 필요하지 않습니다.',inputs:'직접 입력한 지시문',outputs:'텍스트',example:'텍스트 → 이미지 생성 → 이미지 저장'},
 image:{title:'이미지 업로드',summary:'내 컴퓨터의 이미지를 불러와 생성이나 편집에 사용할 재료로 전달합니다.',inputs:'PNG · JPG · WebP 파일',outputs:'업로드한 이미지',example:'이미지 업로드 → 이미지 편집기에 지시 입력 → 이미지 저장',tip:'카드를 짧게 클릭하면 파일 선택, 누른 채 끌면 노드 이동입니다. 이미지가 있어도 같은 방식으로 바꿀 수 있어요.'},
 generate:{title:'이미지 생성',summary:'지시문으로 새 이미지를 만들거나, HairLock과 기존 이미지를 연결해 이 노드에 새 결과를 만듭니다.',inputs:'텍스트 · 참조 이미지 · 선택 스킬 (HairLock 사용 시 이미지 필수)',outputs:'AI가 생성한 이미지',example:'이미지 생성기에 지시 입력 → 생성 → 이미지 저장',tip:'카드 안에 지시문을 입력하세요. HairLock 사용 시 이전 이미지와 스킬을 이 노드에 연결하고 이 노드를 실행합니다. AI 연결과 ChatGPT 로그인이 필요합니다.'},
 edit:{title:'이미지 편집',summary:'연결된 이미지에서 바꿀 부분과 유지할 부분을 지시해 AI로 수정합니다.',inputs:'이미지와 편집 지시문 · 선택 사항인 스킬',outputs:'AI가 수정한 이미지',example:'이미지 업로드 → 이미지 편집기에 지시 입력 → 이미지 저장',tip:'카드 안에 편집 지시를 직접 입력하세요. 편집할 이미지가 최소 한 장 필요합니다. 생성한 이미지도 연결할 수 있어요.'},
};

export function authPhase(status,pending=false){return status.error?'error':status.account?'signed-in':pending?'pending':'ready';}
export function officialLoginUrl(value){try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password&&['auth.openai.com','auth0.openai.com','chatgpt.com'].includes(url.hostname);}catch{return false;}}

export const MAX_SCENE_LENGTH=400;

export function wantsDistinctScenes(prompt,count){
 if(count<2)return false;
 return /(?:각각|서로|장면\s*마다|이미지\s*마다|컷\s*마다|한\s*장\s*마다).{0,50}?(?:다른|다르게|다양한|겹치지)|(?:다른|다르게|겹치지).{0,35}?(?:각각|장면\s*마다|이미지\s*마다|컷\s*마다)|\b(?:different|distinct|unique)\b.{0,55}\b(?:each|every|per image|per shot|scenes|actions|poses|angles)\b|\b(?:each|every|per image|per shot)\b.{0,55}\b(?:different|distinct|unique)\b/iu.test(prompt);
}

export function validateScenes(scenes,count){
 if(!Number.isInteger(count)||count<2||count>10||!Array.isArray(scenes)||scenes.length!==count||
   scenes.some(scene=>typeof scene!=='string'||!scene.trim()||scene.trim().length>MAX_SCENE_LENGTH)){
  throw new Error('요청한 장수만큼 장면을 기획하지 못했습니다. 다시 시도하세요.');
 }
 const result=scenes.map(scene=>scene.trim());
 const keys=result.map(scene=>scene.normalize('NFKC').toLowerCase().replace(/[\p{P}\p{Z}\s]+/gu,''));
 if(keys.some(key=>!key)||new Set(keys).size!==count)throw new Error('기획한 장면이 겹칩니다. 다시 시도하세요.');
 return result;
}

export function sceneRequest(request,scene){
 if(!scene)return request;
 return {...request,prompt:request.prompt+'\n\n[이번 이미지에 배정된 장면]\n'+scene+
  '\n이 장면 한 컷만 생성하세요. 원래 요청의 캐릭터, 참조 이미지 및 공통 조건을 유지하고, 여러 장의 차이를 요구한 부분은 이 장면으로 반영하세요.'};
}

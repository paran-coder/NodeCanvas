import {normalizeProject,projectBytes,isImage} from './2026-10-31-graph.mjs';
const shallow=g=>({...g,nodes:g.nodes.map(n=>({...n,data:{...n.data}})),edges:g.edges.map(e=>({...e}))});
export function blobFromImage(uri){if(!isImage(uri))throw new Error('지원하지 않는 이미지입니다.');const [header,encoded]=uri.split(',');const raw=atob(encoded),bytes=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);return new Blob([bytes],{type:header.slice(5,-7)});}
export async function imageFromBlob(blob){const bytes=new Uint8Array(await blob.arrayBuffer());let result='';for(let i=0;i<bytes.length;i+=32768)result+=String.fromCharCode(...bytes.subarray(i,i+32768));return `data:${blob.type};base64,${btoa(result)}`;}
async function tinyPreview(blob){if(typeof createImageBitmap!=='function'||typeof document==='undefined')return '';let bitmap;try{bitmap=await createImageBitmap(blob);const scale=Math.min(1,100/Math.max(bitmap.width,bitmap.height));const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));const context=canvas.getContext('2d');context.fillStyle='#ffffff';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(bitmap,0,0,canvas.width,canvas.height);const result=canvas.toDataURL('image/jpeg',.55);return result.length<=14000?result:'';}catch{return '';}finally{bitmap?.close();}}
export async function packProject(input,{allowOversized=false}={}){
 const normalized=normalizeProject(input,{allowOversized}),graph=shallow(normalized),preview=shallow(normalized),byUri=new Map(),assets=[];
 for(let i=0;i<graph.nodes.length;i++){
  const node=graph.nodes[i],uri=node.data.image;preview.nodes[i].data.text=(preview.nodes[i].data.text||'').slice(0,100);preview.nodes[i].data.image='';
  if(!uri)continue;let asset=byUri.get(uri);
  if(!asset){const blob=blobFromImage(uri);const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer()));const id=blob.type+':'+Array.from(digest,x=>x.toString(16).padStart(2,'0')).join('');asset=assets.find(a=>a.id===id);if(!asset){asset={id,blob,bytes:blob.size,preview:assets.length<8?await tinyPreview(blob):''};assets.push(asset);}byUri.set(uri,asset);}
  node.data.image='';node.data.imageKey=asset.id;preview.nodes[i].data.image=asset.preview;
 }
 return {graph,preview,assets,assetKeys:[...new Set(assets.map(a=>a.id))],bytes:projectBytes(normalized)};
}
export async function unpackProject(graph,assets){const restored=shallow(graph),cache=new Map();for(const node of restored.nodes){if(!node.data.imageKey)continue;const key=node.data.imageKey,asset=assets.get(key);if(!asset?.blob)throw new Error('저장된 이미지가 없습니다. JSON 백업에서 프로젝트를 복구해 주세요.');if(!cache.has(key))cache.set(key,await imageFromBlob(asset.blob));node.data.image=cache.get(key);delete node.data.imageKey;}return normalizeProject(restored,{allowOversized:true});}

export function uploadApplies(ticket,current){return ticket.projectId===current.projectId&&ticket.session===current.session&&current.project.nodes.some(n=>n.id===ticket.nodeId&&n.type==='image');}

import {verify,createHash,randomUUID} from 'node:crypto';
import {mkdir,lstat,readFile,writeFile,rename,unlink} from 'node:fs/promises';
import path from 'node:path';
export const UPDATE_ORIGIN='https://nodenanvas.vercel.app';
export const MANIFEST_URL=UPDATE_ORIGIN+'/2026-11-01-update.json';
const digest=data=>createHash('sha256').update(data).digest('hex');
const version=v=>{if(typeof v!=='string'||!/^\d{1,5}\.\d{1,5}\.\d{1,5}$/.test(v))throw new Error('업데이트 버전 오류');return v.split('.').map(Number);};
const compare=(a,b)=>{const x=version(a),y=version(b);for(let i=0;i<3;i++)if(x[i]!==y[i])return Math.sign(x[i]-y[i]);return 0;};
export function verifyRelease(envelope,publicKey,current){
 if(!envelope||typeof envelope.payload!=='string'||typeof envelope.signature!=='string'||envelope.payload.length>16000||envelope.signature.length>2048||!verify('sha256',Buffer.from(envelope.payload),publicKey,Buffer.from(envelope.signature,'base64')))throw new Error('업데이트 서명 검증 실패');
 const r=JSON.parse(Buffer.from(envelope.payload,'base64').toString('utf8'));version(r.version);
 if(r.schema!==1||r.url!==`${UPDATE_ORIGIN}/2026-10-31-NodeCanvas-Setup-v${r.version}.exe`||!Number.isSafeInteger(r.size)||r.size<1||r.size>20_000_000||typeof r.sha256!=='string'||!/^[a-f0-9]{64}$/.test(r.sha256))throw new Error('업데이트 정보가 올바르지 않습니다.');
 const order=compare(r.version,current);if(order<0)throw new Error('이전 버전 업데이트는 적용하지 않습니다.');return order===0?null:r;
}
async function safeTree(directory){let current=path.resolve(directory);while(true){try{if((await lstat(current)).isSymbolicLink())throw new Error('업데이트 경로에 링크를 사용할 수 없습니다.');}catch(e){if(e.code!=='ENOENT')throw e;}const parent=path.dirname(current);if(parent===current)break;current=parent;}}
async function limited(response,maximum){if(!response.ok||response.redirected)throw new Error('업데이트 서버 응답 오류');if(Number(response.headers.get('content-length'))>maximum)throw new Error('업데이트 크기 초과');let size=0;const chunks=[];for await(const chunk of response.body){size+=chunk.length;if(size>maximum){throw new Error('업데이트 크기 초과');}chunks.push(chunk);}return Buffer.concat(chunks);}
export class UpdateManager{
 constructor({directory,publicKey,current='1.14.2',fetcher=fetch,apply}){this.directory=path.resolve(directory);this.publicKey=publicKey;this.current=current;this.fetcher=fetcher;this.applyRelease=apply;this.state='idle';this.message='업데이트 확인 전';this.release=null;this.pending=null;this.closed=false;this.controller=null;}
 status(){return {state:this.state,message:this.message,current:this.current,version:this.release?.version||null};}
 async check(){if(this.closed||this.state==='applying'||this.state==='ready')return this.status();if(this.pending)return this.pending;this.pending=this.download().finally(()=>{this.pending=null;});return this.pending;}
 async download(){this.state='checking';this.message='업데이트 확인 중';const controller=new AbortController();this.controller=controller;const timer=setTimeout(()=>controller.abort(),60000);timer.unref();let temporary;
 try{
 const raw=await limited(await this.fetcher(MANIFEST_URL,{redirect:'error',signal:controller.signal,cache:'no-store'}),24000);
 const release=verifyRelease(JSON.parse(raw.toString('utf8')),this.publicKey,this.current);
 if(!release){this.state='current';this.message='최신 연결 앱입니다.';return this.status();}
 this.release=release;this.state='downloading';this.message='새 연결 앱을 다운로드하고 있습니다…';
 const bytes=await limited(await this.fetcher(release.url,{redirect:'error',signal:controller.signal}),release.size);
 if(bytes.length!==release.size||digest(bytes)!==release.sha256)throw new Error('업데이트 파일 검증 실패');
 if(this.closed)throw new Error('업데이트 확인을 종료했습니다.');await safeTree(this.directory);await mkdir(this.directory,{recursive:true});await safeTree(this.directory);
 temporary=path.join(this.directory,`2026-11-01-update-${randomUUID()}.tmp`);await writeFile(temporary,bytes,{flag:'wx'});
 this.file=path.join(this.directory,`2026-11-01-update-v${release.version}.exe`);await safeTree(this.file);await rename(temporary,this.file);temporary=null;
 this.state='ready';this.message=`연결 앱 v${release.version} 업데이트 준비 완료`;
 }catch(e){this.state='error';this.message='업데이트를 확인하지 못했습니다. 잠시 후 다시 확인해 주세요.';this.release=null;}
 finally{clearTimeout(timer);this.controller=null;if(temporary)await unlink(temporary).catch(()=>{});}return this.status();}
 async apply({busy=false,activation}={}){
 if(busy)throw new Error('현재 작업이 끝난 뒤 업데이트하세요.');if(this.closed||this.state!=='ready'||!this.release||!this.file)throw new Error('적용할 업데이트가 준비되지 않았습니다.');
 this.state='applying';this.message='업데이트를 적용하고 다시 연결합니다…';
 try{await safeTree(this.file);const bytes=await readFile(this.file);if(bytes.length!==this.release.size||digest(bytes)!==this.release.sha256)throw new Error('업데이트 파일 검증 실패');await this.applyRelease({file:this.file,release:this.release,activation});}
 catch(e){this.state='error';this.message='업데이트 적용 실패 · 기존 앱을 계속 사용하세요.';throw e;}return this.status();
 }
 close(){this.closed=true;this.controller?.abort();}
}

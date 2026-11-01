import http from 'node:http';
import {randomBytes,randomUUID} from 'node:crypto';
import {readFile,readdir,unlink,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {LeaseRegistry,allowedOrigin,validToken} from './2026-10-31-security.mjs';
import {CodexProvider,validateJob} from './2026-10-31-codex.mjs';

import {ActivationGrants} from './2026-10-31-activation.mjs';
const location=path.dirname(fileURLToPath(import.meta.url));
const webRoot=path.resolve(location,'../web');
const files=new Set(['2026-11-01-guide.mjs','2026-10-31-guide.html','2026-10-31-guide.css','og-image.png','2026-10-31-index.html','2026-10-31-style.css','2026-10-31-app.mjs','2026-10-31-graph.mjs','2026-10-31-storage.mjs','2026-10-31-canvas.mjs','2026-10-31-catalog.mjs','2026-10-31-spaces.mjs','2026-10-31-library.mjs','2026-10-31-assets.mjs','2026-10-31-history.mjs','2026-10-31-NodeCanvas-Setup-v1.7.1.exe']);
const csp="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' http://127.0.0.1:7330; object-src 'none'; base-uri 'none'; frame-ancestors 'none'";
export async function createConnector({port=7330,origins=[],pairCode=process.env.NODECANVAS_PAIR_CODE||randomBytes(6).toString('hex'),autoExit=true,activationDir=null,provider=new CodexProvider(path.resolve(process.env.NODECANVAS_DATA_ROOT||path.resolve(location,'../.runtime'),'codex')),onExit=()=>{}}={}) {
  const token=randomBytes(32).toString('hex'),allow=new Set(origins),leases=new LeaseRegistry(),jobs=new Map(),streams=new Map();
  const grants=new ActivationGrants();
  let activationLoad=Promise.resolve();
  async function readActivations(){if(!activationDir)return;await mkdir(activationDir,{recursive:true});for(const name of (await readdir(activationDir)).filter(n=>/^[a-f0-9-]+\.json$/.test(n)).slice(0,64)){const file=path.join(activationDir,name);try{const record=JSON.parse(await readFile(file,'utf8'));if(grants.approve(record))allow.add(record.origin);}catch{}finally{await unlink(file).catch(()=>{});}}}
  function loadActivations(){activationLoad=activationLoad.then(readActivations,readActivations);return activationLoad;}
  let failures=0,blockedUntil=0,active=null,closed=false,authBusy=false;
  function json(res,status,body) {res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(body));}
  async function body(req) {
    if(!req.headers['content-type']?.startsWith('application/json')) throw Object.assign(new Error('JSON 요청만 허용됩니다.'),{status:415});
    let size=0;const chunks=[];
    for await(const chunk of req) {size+=chunk.length;if(size>40_000_000)throw Object.assign(new Error('요청 크기는 40MB 이하여야 합니다.'),{status:413});chunks.push(chunk);}
    try {return JSON.parse(Buffer.concat(chunks).toString());}catch {throw Object.assign(new Error('잘못된 JSON입니다.'),{status:400});}
  }
  const server=http.createServer(async(req,res)=>{
    res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
    try {
      if(closed)return json(res,503,{error:'연결 앱을 종료하고 있습니다.'});
      if(![`127.0.0.1:${actualPort}`,`localhost:${actualPort}`].includes(req.headers.host)) return json(res,403,{error:'허용하지 않는 호스트입니다.'});
      const pathname=new URL(req.url,'http://127.0.0.1').pathname;
      if(!pathname.startsWith('/api/')) {
        if(req.method!=='GET') return json(res,405,{error:'GET만 허용됩니다.'});
        const name=pathname==='/'?'2026-10-31-index.html':pathname.slice(1);
        if(!files.has(name)) return json(res,404,{error:'파일이 없습니다.'});
        const data=await readFile(path.join(webRoot,name));
        res.writeHead(200,{'Content-Type':name.endsWith('.png')?'image/png':name.endsWith('.exe')?'application/octet-stream':name.endsWith('.zip')?'application/zip':name.endsWith('.html')?'text/html; charset=utf-8':name.endsWith('.css')?'text/css; charset=utf-8':'text/javascript; charset=utf-8','Content-Security-Policy':csp,'Cache-Control':'no-cache'});return res.end(data);
      }
      if(pathname==='/api/ready'&&req.method==='GET'&&!req.headers.origin)return json(res,200,{app:'NodeCanvas',version:'1.7.1'});
      await loadActivations();
      if(req.method!=='POST' && req.method!=='OPTIONS') return json(res,405,{error:'POST만 허용됩니다.'});
      if(!allowedOrigin(req.headers.origin,allow)) return json(res,403,{error:'이 웹 주소는 연결 앱에서 허용하지 않았습니다. -SiteUrl 설정을 확인하세요.'});
      res.setHeader('Access-Control-Allow-Origin',req.headers.origin);res.setHeader('Vary','Origin');
      res.setHeader('Access-Control-Allow-Methods','POST, OPTIONS');res.setHeader('Access-Control-Allow-Headers','Authorization, Content-Type');
      res.setHeader('Access-Control-Allow-Private-Network','true');
      if(req.method==='OPTIONS') {res.writeHead(204);return res.end();}
      if(pathname!=='/api/pair' && pathname!=='/api/claim' && pathname!=='/api/presence' && !validToken(req.headers.authorization,token))return json(res,401,{error:'연결 코드로 먼저 페어링하세요.'});
      const input=await body(req);
      if(closed)return json(res,503,{error:'연결 앱을 종료하고 있습니다.'});
      if(pathname==='/api/presence')return json(res,200,{app:'NodeCanvas',version:'1.7.1'});
      if(pathname==='/api/claim'){if(!grants.claim(req.headers.origin,input.secret))return json(res,401,{error:'앱 실행 승인을 기다리고 있습니다.'});leases.touch(input.tabId);return json(res,200,{token,version:'1.7.1'});}
      if(pathname==='/api/pair') {
        if(Date.now()<blockedUntil) return json(res,429,{error:'여러 번 실패했습니다. 1분 후 다시 시도하세요.'});
        if(!validToken(`Bearer ${input.code}`,pairCode)) {
          if(++failures>=8) {blockedUntil=Date.now()+60000;failures=0;}
          return json(res,401,{error:'터미널에 표시된 연결 코드를 확인하세요.'});
        }
        leases.touch(input.tabId);failures=0;return json(res,200,{token,version:'1.0.0'});
      }
      if(pathname==='/api/heartbeat') {leases.touch(input.tabId);return json(res,200,{ok:true});}
      if(pathname==='/api/lease') {
        leases.open(input.tabId);
        const previous=streams.get(input.tabId);streams.set(input.tabId,res);previous?.end();
        res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-store','Connection':'keep-alive'});
        res.write(': connected\n\n');
        const pulse=setInterval(()=>res.write(': alive\n\n'),15000);pulse.unref();
        res.on('close',()=>{clearInterval(pulse);if(streams.get(input.tabId)===res){streams.delete(input.tabId);leases.close(input.tabId);}});
        return;
      }
      if(pathname==='/api/status') {if(authBusy)return json(res,409,{error:'로그인 설정을 처리 중입니다. 잠시 뒤 상태를 확인하세요.'});return json(res,200,await provider.status());}
      if(pathname==='/api/login'||pathname==='/api/logout') {
        if(active||authBusy)return json(res,409,{error:'다른 작업이 실행 중입니다. 완료 후 로그인 설정을 변경하세요.'});
        authBusy=true;
        try{return json(res,200,pathname==='/api/login'?await provider.login(input.remember===true):await provider.logout());}finally{authBusy=false;}
      }
      if(pathname==='/api/jobs') {
        const request=validateJob(input);
        if(active||authBusy) return json(res,409,{error:'다른 탭에서 이미지 작업이나 로그인을 처리 중입니다. 완료 후 다시 시도하세요.'});
        while(jobs.size>=12) jobs.delete(jobs.keys().next().value);
        const id=randomUUID(),controller=new AbortController();
        const job={id,state:'running',message:'요청을 준비합니다…',createdAt:Date.now()};jobs.set(id,job);active={id,controller};
        void provider.generate(request,{signal:controller.signal,onProgress:message=>{job.message=message;}}).then(result=>{
          if(!controller.signal.aborted)Object.assign(job,{state:'completed',images:result.images,message:'이미지 생성 완료'});
        }).catch(error=>{Object.assign(job,{state:controller.signal.aborted?'cancelled':'failed',message:error.message});}).finally(()=>{if(active?.id===id)active=null;});
        return json(res,202,{id});
      }
      if(pathname==='/api/job') {const job=jobs.get(input.id);return job?json(res,200,job):json(res,404,{error:'작업을 찾지 못했습니다. 연결 앱을 다시 시작했을 수 있습니다.'});}
      if(pathname==='/api/cancel') {if(active?.id===input.id){active.controller.abort();const job=jobs.get(input.id);Object.assign(job,{state:'cancelled',message:'취소 요청을 보냈습니다.'});await provider.cancel();}return json(res,200,{ok:true});}
      return json(res,404,{error:'지원하지 않는 요청입니다.'});
    } catch(error) {if(!res.headersSent)json(res,error.status||400,{error:error.message||'요청 처리 실패'});else res.end();}
  });
  server.requestTimeout=60000;server.headersTimeout=15000;
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
  const actualPort=server.address().port;
  allow.add(`http://127.0.0.1:${actualPort}`);allow.add(`http://localhost:${actualPort}`);
  async function close() {
    if(closed)return;closed=true;clearInterval(sweep);
    const stopped=new Promise(resolve=>server.close(resolve));
    for(const stream of streams.values())stream.end();active?.controller.abort();
    if(provider.shutdown)await provider.shutdown();else await provider.close();
    server.closeAllConnections();await stopped;
  }
  const sweep=setInterval(()=>{if(autoExit&&leases.expired())void close().then(onExit);},5000);sweep.unref();
  return {port:actualPort,pairCode,close,approveActivation(record){if(!grants.approve(record))return false;allow.add(record.origin);return true;}};
}

if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const args=process.argv.slice(2),index=args.indexOf('--origin'),origins=[];
  if(index>=0) {
    const url=new URL(args[index+1]);
    if(url.protocol!=='https:' && !['localhost','127.0.0.1'].includes(url.hostname))throw new Error('원격 사이트 주소는 HTTPS여야 합니다.');
    origins.push(url.origin);
  }
  const connector=await createConnector({origins,activationDir:process.env.NODECANVAS_ACTIVATION_DIR||null,onExit:()=>{process.stdin.destroy();console.log('마지막 탭 연결이 종료되어 NodeCanvas 연결 앱을 종료했습니다.');}});
  console.log(`\nNodeCanvas v1.7.1\n웹 주소: ${origins[0]||`http://127.0.0.1:${connector.port}`}\n연결 코드: ${connector.pairCode}\n마지막 탭 연결 중단 90초 후 종료 / 최초 접속 대기 5분\n종료: Ctrl+C\n`);
  if(process.env.NODECANVAS_NATIVE==='1'){process.stdin.setEncoding('utf8');process.stdin.on('data',data=>{if(data.trim()==='shutdown')void connector.close().then(()=>process.exit(0));});process.stdin.on('end',()=>void connector.close().then(()=>process.exit(0)));}
  for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{void connector.close();});
}

// Test-only protocol peer. It never contacts OpenAI and is never shipped as a provider.
import {createInterface} from 'node:readline';
const send=message=>process.stdout.write(JSON.stringify(message)+'\n');
const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
let active=false;
createInterface({input:process.stdin}).on('line',line=>{
  const request=JSON.parse(line);if(request.id===undefined)return;
  let result={};
  if(request.method==='account/read')result={account:{type:'chatgpt',email:'fixture@example.test',planType:'plus'}};
  if(request.method==='modelProvider/capabilities/read')result={imageGeneration:true};
  if(request.method==='account/login/start')result={loginId:'login-fixture',authUrl:'https://auth.openai.com/fixture'};
  if(request.method==='thread/start'){
    if(request.params.approvalPolicy!=='untrusted'||request.params.sandbox!=='workspace-write'||!request.params.ephemeral){send({id:request.id,error:{message:'Unsafe thread configuration'}});return;}
    result={thread:{id:'thread-fixture'}};
  }
  if(request.method==='turn/start'){
    active=true;
    const text=request.params.input.find(i=>i.type==='text')?.text||'';
    if(!text.includes('Requested aspect ratio: 3:2')){send({id:request.id,error:{message:'Ratio missing'}});return;}
    const wait=text.includes('slow-test')?150:0;
    setTimeout(()=>{
      send({id:request.id,result:{turn:{id:'turn-fixture'}}});
      if(text.includes('slow-test'))return;
      // Notifications arrive as soon as turn/start resolves: catches listener-registration races.
      send({method:'item/completed',params:{threadId:'thread-fixture',item:{type:'imageGeneration',id:'image-1',status:'completed',result:png}}});
      setTimeout(()=>{send({method:'turn/completed',params:{threadId:'thread-fixture',turn:{id:'turn-fixture',status:'completed',items:[]}}});active=false;},text.includes('delayed-finish')?250:0);
    },wait);
    return;
  }
  if(request.method==='turn/interrupt'){
    active=false;send({method:'turn/completed',params:{threadId:'thread-fixture',turn:{id:'turn-fixture',status:'interrupted'}}});
  }
  if(request.method==='thread/unsubscribe'&&active){send({id:request.id,error:{message:'Turn still active at unsubscribe'}});return;}
  send({id:request.id,result});
});
